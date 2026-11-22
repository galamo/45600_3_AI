import { useCallback, useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Paper from "@mui/material/Paper";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import SendIcon from "@mui/icons-material/Send";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

/**
 * Lab 11 — offline agent chat UI.
 * No server / API: send shows a spinner, then a blank assistant turn.
 */
export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const sendMessage = useCallback(
    (text) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
      setInput("");
      setLoading(true);

      // Simulated wait only — no network.
      timerRef.current = setTimeout(() => {
        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
        setLoading(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      }, 1200);
    },
    [loading]
  );

  function handleSubmit(e) {
    e.preventDefault();
    sendMessage(input);
  }

  function handleClear() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessages([]);
    setInput("");
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  const blank = messages.length === 0 && !loading;

  return (
    <Box
      sx={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.default",
      }}
    >
      <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Toolbar sx={{ gap: 1 }}>
          <Typography variant="h6" sx={{ flex: 1, fontWeight: 600 }}>
            Agent
          </Typography>
          <Button
            size="small"
            startIcon={<DeleteOutlineIcon />}
            onClick={handleClear}
            disabled={loading && messages.length === 0}
            color="inherit"
          >
            New chat
          </Button>
        </Toolbar>
      </AppBar>

      <Box
        component="main"
        sx={{
          flex: 1,
          overflowY: "auto",
          px: { xs: 2, sm: 3 },
          py: 2,
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
        }}
      >
        {blank ? (
          <Box
            sx={{
              flex: 1,
              display: "grid",
              placeItems: "center",
              color: "text.disabled",
            }}
          >
            {/* Intentionally blank — empty agent screen */}
          </Box>
        ) : (
          messages.map((msg, i) => (
            <Stack
              key={i}
              direction="row"
              justifyContent={msg.role === "user" ? "flex-end" : "flex-start"}
            >
              <Paper
                elevation={0}
                sx={{
                  maxWidth: "75%",
                  px: 1.75,
                  py: 1.25,
                  borderRadius: 3,
                  bgcolor: msg.role === "user" ? "primary.main" : "grey.100",
                  color: msg.role === "user" ? "primary.contrastText" : "text.primary",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  minHeight: msg.role === "assistant" && !msg.content ? 40 : undefined,
                  minWidth: msg.role === "assistant" && !msg.content ? 48 : undefined,
                }}
              >
                {msg.content || (msg.role === "assistant" ? "\u00A0" : "")}
              </Paper>
            </Stack>
          ))
        )}

        {loading && (
          <Stack direction="row" justifyContent="flex-start" alignItems="center" spacing={1.5} sx={{ pl: 0.5 }}>
            <CircularProgress size={22} thickness={4} />
            <Typography variant="body2" color="text.secondary">
              Thinking…
            </Typography>
          </Stack>
        )}

        <div ref={bottomRef} />
      </Box>

      <Paper
        component="form"
        onSubmit={handleSubmit}
        elevation={0}
        square
        sx={{
          display: "flex",
          gap: 1,
          p: 2,
          borderTop: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <TextField
          inputRef={inputRef}
          fullWidth
          size="small"
          placeholder="Message the agent…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          autoComplete="off"
          autoFocus
        />
        <IconButton
          type="submit"
          color="primary"
          disabled={!input.trim() || loading}
          aria-label="Send"
        >
          <SendIcon />
        </IconButton>
      </Paper>
    </Box>
  );
}
