import { Box, FormControl, Input, Link, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { BinaranDocs, BinranDocEntry } from "./type";
import MiniSearch from "minisearch";
import { useMemo, useState } from "react";
import { HighlightedText } from "./HighlightedText";

const BINRAN_DOCS_PATH = "/index-20250412.json";

export default function App() {
  const { data: miniSearch, isLoading } = useQuery({
    queryKey: ["binran"],
    queryFn: async () => {
      const docs: BinaranDocs = await fetch(BINRAN_DOCS_PATH).then((res) =>
        res.json(),
      );
      const miniSearch = new MiniSearch({
        fields: ["content"],
        storeFields: ["url", "content"],
        idField: "url",
        tokenize: (text) => {
          const segmenterJaJp = new Intl.Segmenter("ja-JP", {
            granularity: "word",
          });
          return [...segmenterJaJp.segment(text)].map((s) => s.segment);
        },
      });

      miniSearch.addAll(docs);

      return miniSearch;
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
  const [search, setSearch] = useState("");
  const results = useMemo(() => {
    if (!miniSearch) return [];
    return miniSearch.search(search);
  }, [miniSearch, search]);

  return (
    <>
      <Box
        p="24px"
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          backgroundColor: "#f5f5f5",
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            backgroundColor: "#fff",
            borderRadius: "8px",
            padding: "24px",
            boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
            width: "100%",
            maxWidth: "800px",
          }}
        >
          <Typography variant="h1" component="h1" fontSize="3rem">
            ZEN便覧サーチ(非公式ツール)
          </Typography>
          <Typography variant="body1" component="p">
            ZEN大学の便覧の情報を全文検索するためのツールです。
            <br />
            非公式のツールです。内容が最新のものとは限りません。
          </Typography>
          <FormControl fullWidth>
            <Input
              placeholder="検索ワード"
              inputProps={{ "aria-label": "description" }}
              sx={{
                fontSize: "1.5rem",
                fontWeight: "bold",
                border: "1px solid #ccc",
                borderRadius: "4px",
                padding: "16px",
                "&:focus": {
                  borderColor: "#3f51b5",
                  boxShadow: "0 0 5px rgba(63, 81, 181, 0.5)",
                },
              }}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
            />
          </FormControl>

          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              marginTop: "24px",
            }}
          >
            {results.length === 0 &&
              search.length > 0 &&
              (isLoading ? (
                <Typography variant="h5" component="p">
                  検索中...
                </Typography>
              ) : (
                <Typography variant="h5" component="p">
                  検索結果が見つかりませんでした
                </Typography>
              ))}
            {results.map((result) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const doc: BinranDocEntry = result as any;

              return (
                <Box
                  key={result.id}
                  sx={{
                    backgroundColor: "#fff",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    padding: "16px",
                    marginBottom: "16px",
                    width: "100%",
                  }}
                >
                  <Link
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{
                      textDecoration: "none",
                      color: "#3f51b5",
                      fontSize: "1.2rem",
                      fontWeight: "bold",
                      "&:hover": {
                        textDecoration: "underline",
                      },
                    }}
                  >
                    {doc.url}
                  </Link>
                  <HighlightedText
                    text={doc.content}
                    hightlight={result.queryTerms}
                  />
                </Box>
              );
            })}
          </Box>
        </Box>
      </Box>
    </>
  );
}
