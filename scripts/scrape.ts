import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { dirname, join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { pooledMap } from "https://deno.land/std@0.224.0/async/pool.ts";

// --- Configuration ---
const START_URL = "https://sites.google.com/zen.ac.jp/zen-gakuseibinran/home";
const BASE_HOSTNAME = "sites.google.com";
const ALLOWED_PATH_PREFIX = "/zen.ac.jp/zen-gakuseibinran/";
const DELAY_MS = 500; // Politeness delay between fetches (milliseconds)
const MAX_CONCURRENCY = 5; // Max number of pages to fetch concurrently

// --- Dynamic Output Directory & File ---
const today = new Date(); // Using current date from context: 2025-04-12
const dateStamp = today.toISOString().slice(0, 10).replace(/-/g, ""); // Format: YYYYMMDD -> 20250412
const OUTPUT_DIR = `./text-${dateStamp}`; // e.g., ./text-20250412
const JSON_OUTPUT_FILENAME = `index-${dateStamp}.json`; // e.g., index-20250412.json

// --- State Variables ---
const visitedUrls = new Set<string>();
const scrapedData: { url: string; content: string }[] = []; // Array to hold results for JSON

// --- Helper Functions ---

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    urlObj.hash = ""; // Remove hash fragment
    return urlObj.toString();
  } catch (e) {
    console.error(`[Error] Invalid URL string: ${url}`, e);
    return url;
  }
}

function isValidUrlToCrawl(url: string, baseUrlObj: URL): boolean {
  try {
    const currentUrlObj = new URL(url);
    if (!["http:", "https:"].includes(currentUrlObj.protocol)) return false;
    if (currentUrlObj.hostname !== baseUrlObj.hostname) return false;
    if (!currentUrlObj.pathname.startsWith(ALLOWED_PATH_PREFIX)) return false;
    return true;
  } catch (e) {
    // console.warn(`[Warn] Could not validate URL: ${url}`, e); // Less noisy
    return false;
  }
}

function urlToFilename(url: string, extension: string): string {
  try {
    const urlObj = new URL(url);
    let filename = (urlObj.pathname + urlObj.search + urlObj.hash)
      .replace(/^\/|\/$/g, "")
      .replace(/\//g, "_")
      .replace(/[^a-zA-Z0-9_\-\.]/g, "_") || "index";

    const maxLength = 100;
    if (filename.length > maxLength) {
      filename = filename.substring(filename.length - maxLength);
    }
    return `${filename}${extension}`;
  } catch {
    return `invalid_url_${Date.now()}${extension}`;
  }
}

async function fetchWithRetry(
  url: string,
  retries = 3,
  delay = 1000,
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      await sleep(DELAY_MS);
      // console.log(`[Fetch] Attempt ${i + 1}/${retries} for ${url}`); // Less verbose log
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; Deno Scraper/1.0; +https://deno.land)",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status} for ${url}`);
      }
      return response;
    } catch (error) {
      console.warn(
        `[Warn] Fetch attempt ${i + 1} failed for ${url}: ${error.message}`,
      );
      if (i === retries - 1) throw error;
      await sleep(delay * (i + 1));
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries} attempts.`);
}

// --- Main Scraping Logic ---

/**
 * Processes a single URL: fetches, parses, extracts text, saves text,
 * finds new links, and adds data to the global scrapedData array.
 * Returns an array of newly found valid URLs to crawl.
 */
async function processUrl(url: string): Promise<string[]> {
  if (visitedUrls.has(url) || !isValidUrlToCrawl(url, new URL(START_URL))) {
    return [];
  }

  console.log(`[Process] Processing: ${url}`);
  visitedUrls.add(url);
  const newUrlsFound: string[] = [];

  try {
    const response = await fetchWithRetry(url);
    const html = await response.text();
    const document = new DOMParser().parseFromString(html, "text/html");

    if (!document) {
      console.warn(`[Warn] Could not parse HTML for ${url}`);
      return [];
    }

    // 1. Extract Text
    const mainContent = document.querySelector(
      '[role="main"], #main-content, .main-content',
    );
    const textContent = (mainContent || document.body)?.textContent?.trim() ||
      "";

    if (textContent) {
      // 2. Save Text to File
      const textFilename = urlToFilename(url, ".txt");
      const textPath = join(OUTPUT_DIR, textFilename);
      // Ensure directory exists (needed for the first file) - ensureDir handles existing dirs fine
      await ensureDir(OUTPUT_DIR);
      await Deno.writeTextFile(textPath, textContent);
      console.log(`[Save Text] Saved text to ${textPath}`);

      // 3. Add to JSON data collection
      // NOTE: Pushing directly to a shared array from concurrent workers is generally safe
      // for simple additions like this, but could lead to non-deterministic order or issues
      // if more complex state modifications were needed.
      scrapedData.push({ url: url, content: textContent });
    } else {
      console.log(`[Save Text] No significant text content found for ${url}`);
    }

    // 4. Find and Queue New Links (No image processing anymore)
    const links = document.querySelectorAll("a");
    for (const link of links) {
      const href = link.getAttribute("href");
      if (href) {
        try {
          const absoluteUrl = normalizeUrl(new URL(href, url).toString());
          if (
            isValidUrlToCrawl(absoluteUrl, new URL(START_URL)) &&
            !visitedUrls.has(absoluteUrl)
          ) {
            newUrlsFound.push(absoluteUrl);
          }
        } catch (linkError) {
          // console.warn(`[Warn] Skipping invalid link href: ${href} on page ${url}`); // Less noisy
        }
      }
    }
  } catch (error) {
    console.error(`[Error] Failed to process ${url}: ${error.message}`);
    // Optionally add failed URL to a separate list if needed
  }

  return newUrlsFound;
}

// --- Script Execution ---

async function main() {
  console.log(`[Start] Starting text scrape for ${START_URL}`);
  console.log(`[Config] Output Dir: ${OUTPUT_DIR}`);
  console.log(`[Config] Allowed Path: ${ALLOWED_PATH_PREFIX}`);
  console.log(`[Config] Max Concurrency: ${MAX_CONCURRENCY}`);
  console.log(`[Config] Delay: ${DELAY_MS}ms`);

  // Ensure the main output directory exists before starting
  await ensureDir(OUTPUT_DIR);

  const initialUrl = normalizeUrl(START_URL);
  const activeUrls = new Set<string>([initialUrl]);

  while (activeUrls.size > 0) {
    const currentBatch = Array.from(activeUrls);
    activeUrls.clear();

    console.log(`\n[Crawl] Processing batch of ${currentBatch.length} URLs...`);

    const resultsIterator = pooledMap(
      MAX_CONCURRENCY,
      currentBatch,
      (url) => processUrl(url),
    );

    for await (const newUrls of resultsIterator) {
      for (const newUrl of newUrls) {
        if (!visitedUrls.has(newUrl)) {
          activeUrls.add(newUrl);
        }
      }
    }
    console.log(`[Crawl] Found ${activeUrls.size} new URLs in this batch.`);
  }

  console.log(
    `\n[Complete] Scraping finished. Visited ${visitedUrls.size} pages.`,
  );
  console.log(`[Output] Text files saved in: ${OUTPUT_DIR}`);

  // Write the collected data to JSON
  if (scrapedData.length > 0) {
    const jsonFilePath = join(OUTPUT_DIR, JSON_OUTPUT_FILENAME);
    try {
      const jsonString = JSON.stringify(scrapedData, null, 2); // Pretty print JSON
      await Deno.writeTextFile(jsonFilePath, jsonString);
      console.log(`[Output] Index JSON saved to: ${jsonFilePath}`);
    } catch (jsonError) {
      console.error(
        `[Error] Failed to write JSON index file: ${jsonError.message}`,
      );
    }
  } else {
    console.log("[Output] No data collected to write to JSON index file.");
  }
}

await main();
