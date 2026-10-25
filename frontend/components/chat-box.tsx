"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiAuthError } from "@/utils/api";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ChatBoxProps {
  projectId: string;
  projectTitle?: string;
}

export default function ChatBox({ projectId, projectTitle }: ChatBoxProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom of conversation
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Adjust textarea height dynamically up to a maximum
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        200
      )}px`;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && input.trim()) {
        handleSubmit();
      }
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    // Clear error & preserve input in case of recoverable failure
    setErrorMessage(null);
    const userMessage: ChatMessage = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    setIsLoading(true);

    try {
      const response = await apiFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          message: trimmed,
          project_id: projectId,
        }),
      });

      // 1. Session expired or unauthenticated -> redirect to login preserving return path
      if (response.status === 401) {
        const returnUrl = typeof window !== "undefined" ? window.location.pathname : "/dashboard";
        router.push(`/login?next=${encodeURIComponent(returnUrl)}`);
        return;
      }

      // 2. Rate limit exceeded (HTTP 429)
      if (response.status === 429) {
        let msg = "Rate limit exceeded. Please wait a moment before sending more messages.";
        try {
          const data = await response.json();
          if (data?.detail) msg = data.detail;
        } catch {
          // fallback to friendly message
        }
        setErrorMessage(msg);
        return;
      }

      // 3. Provider outage or capacity failure (HTTP 503)
      if (response.status === 503) {
        let msg = "The AI service is busy. Please try again shortly.";
        try {
          const data = await response.json();
          if (data?.detail) msg = data.detail;
        } catch {
          // fallback to friendly message
        }
        setErrorMessage(msg);
        return;
      }

      // 4. Other non-200 responses
      if (!response.ok) {
        let msg = "An unexpected error occurred while communicating with the AI service.";
        try {
          const data = await response.json();
          if (data?.detail) msg = data.detail;
        } catch {
          // fallback to friendly message
        }
        setErrorMessage(msg);
        return;
      }

      // 5. Successful generation
      const data = await response.json();
      const reply = typeof data?.reply === "string" ? data.reply : "";

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + 1),
        role: "assistant",
        content: reply,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: unknown) {
      if (err instanceof ApiAuthError) {
        const returnUrl = typeof window !== "undefined" ? window.location.pathname : "/dashboard";
        router.push(`/login?next=${encodeURIComponent(returnUrl)}`);
        return;
      }

      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Failed to connect to the backend service. Verify the API is running."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestedPrompt = (promptText: string) => {
    setInput(promptText);
    textareaRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-[650px] max-h-[calc(100vh-280px)] rounded-2xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden">
      {/* Chat Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-3.5 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-xs shadow-xs">
            AI
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              CortexDesk Assistant
            </h2>
            <p className="text-2xs text-zinc-500 dark:text-zinc-400">
              Context bound to {projectTitle || "current workspace"}
            </p>
          </div>
        </div>

        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setMessages([])}
            className="text-xs text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Clear conversation
          </button>
        )}
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 mb-3">
              <svg
                className="h-6 w-6"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
                />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Workspace Intelligence
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 max-w-sm">
              Ask questions, brainstorm strategies, or summarize concepts related to this project workspace.
            </p>

            {/* Quick Starter Prompts */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-md text-left">
              {[
                "What are the key goals for this workspace?",
                "Help me outline next steps for this project.",
                "Summarize our current progress.",
                "Generate a checklist of deliverables.",
              ].map((starter, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSuggestedPrompt(starter)}
                  className="rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 transition dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  &ldquo;{starter}&rdquo;
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.role === "user" ? "items-end" : "items-start"
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1 px-1">
                <span className="text-2xs font-semibold text-zinc-500 dark:text-zinc-400">
                  {msg.role === "user" ? "You" : "CortexDesk AI"}
                </span>
                <span className="text-3xs text-zinc-400 dark:text-zinc-500">
                  {msg.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>

              <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 rounded-tr-xs"
                    : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 rounded-tl-xs border border-zinc-200/60 dark:border-zinc-700/60"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}

        {/* Thinking Indicator */}
        {isLoading && (
          <div className="flex flex-col items-start space-y-1">
            <span className="text-2xs font-semibold text-zinc-500 dark:text-zinc-400 px-1">
              CortexDesk AI
            </span>
            <div className="flex items-center gap-2 rounded-2xl rounded-tl-xs bg-zinc-100 px-4 py-3 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200/60 dark:border-zinc-700/60">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-bounce" />
                <span
                  className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
              </span>
              <span>Thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error Feedback Banner */}
      {errorMessage && (
        <div
          role="alert"
          className="mx-6 mb-3 flex items-start justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="shrink-0 text-amber-700 hover:text-amber-950 dark:text-amber-300 dark:hover:text-amber-100"
            aria-label="Dismiss alert"
          >
            ✕
          </button>
        </div>
      )}

      {/* Input Form Area */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-zinc-200 p-4 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="relative flex flex-col gap-2">
          <label htmlFor="chat-message-input" className="sr-only">
            Ask CortexDesk Assistant
          </label>
          <textarea
            id="chat-message-input"
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about this project... (Shift+Enter for new line)"
            disabled={isLoading}
            className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:bg-white focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-zinc-600 dark:focus:bg-zinc-950 disabled:opacity-60 transition"
          />

          <div className="flex items-center justify-between pt-1">
            <span className="text-3xs text-zinc-400 dark:text-zinc-500">
              Press <kbd className="font-mono rounded bg-zinc-100 dark:bg-zinc-800 px-1">Enter</kbd> to send, <kbd className="font-mono rounded bg-zinc-100 dark:bg-zinc-800 px-1">Shift+Enter</kbd> for newline
            </span>

            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              aria-label="Send message"
              className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
            >
              {isLoading ? (
                <>
                  <svg
                    className="h-3.5 w-3.5 animate-spin text-current"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>Sending</span>
                </>
              ) : (
                <>
                  <span>Send</span>
                  <svg
                    className="h-3.5 w-3.5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                    />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
