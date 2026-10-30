"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiAuthError, ApiTimeoutError, ApiNetworkError } from "@/utils/api";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ChatBoxProps {
  projectId: string;
  projectTitle?: string;
  projectDescription?: string | null;
  className?: string;
}

// Bounded frontend timeout compatible with backend agent timeout (55.0s)
const CHAT_CLIENT_TIMEOUT_MS = 60000;

/**
 * Safely parses inline markdown tokens (URLs, inline code, bold text)
 * without dangerouslySetInnerHTML.
 */
function renderInlineText(text: string): React.ReactNode {
  if (!text) return null;

  const tokenRegex = /(https?:\/\/[^\s<>"'{}|\\^`]+|`[^`]+`|\*\*[^*]+\*\*)/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, index) => {
    // 1. External URLs
    if (/^https?:\/\//i.test(part)) {
      let cleanUrl = part;
      let trailingPunctuation = "";
      const punctMatch = part.match(/([.,;:!?)]+)$/);
      if (punctMatch) {
        trailingPunctuation = punctMatch[1];
        cleanUrl = part.slice(0, -trailingPunctuation.length);
      }

      try {
        const parsed = new URL(cleanUrl);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          return (
            <span key={index} className="inline-flex items-center gap-0.5">
              <a
                href={cleanUrl}
                target="_blank"
                rel="noopener noreferrer"
                tabIndex={0}
                className="text-blue-600 dark:text-blue-400 font-medium underline underline-offset-2 hover:text-blue-800 dark:hover:text-blue-300 break-all transition focus-visible:outline-2 focus-visible:outline-blue-500 rounded-xs"
              >
                {cleanUrl}
              </a>
              <svg
                className="h-3 w-3 inline text-zinc-400 dark:text-zinc-500 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                />
              </svg>
              {trailingPunctuation}
            </span>
          );
        }
      } catch {
        // Fall back to plain text
      }
    }

    // 2. Inline code
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={index}
          className="rounded-md bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-zinc-800 dark:text-zinc-200 border border-zinc-200/60 dark:border-zinc-700/60"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    // 3. Bold text
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={index} className="font-semibold text-zinc-900 dark:text-zinc-100">
          {part.slice(2, -2)}
        </strong>
      );
    }

    return <span key={index}>{part}</span>;
  });
}

/**
 * Parses multi-line message content into structured, accessible React nodes
 * supporting paragraphs, code blocks with copy, bullet lists, and numbered lists safely.
 */
function FormattedMessage({ content }: { content: string }) {
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null);

  if (!content) return null;

  const lines = content.split("\n");
  const nodes: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockBuffer: string[] = [];
  let codeBlockCount = 0;

  const handleCopyCode = async (index: number, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCodeIndex(index);
      setTimeout(() => setCopiedCodeIndex(null), 2000);
    } catch {
      // Fallback
    }
  };

  lines.forEach((line, lineIdx) => {
    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        const currentCode = codeBlockBuffer.join("\n");
        const currentIndex = codeBlockCount++;
        nodes.push(
          <div
            key={`code-block-${lineIdx}`}
            className="my-3 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-xs"
          >
            <div className="flex items-center justify-between px-3.5 py-1.5 bg-zinc-900 border-b border-zinc-800/80 text-3xs font-mono text-zinc-400">
              <span>Code Snippet</span>
              <button
                type="button"
                onClick={() => handleCopyCode(currentIndex, currentCode)}
                className="hover:text-zinc-200 transition text-3xs font-sans py-0.5 px-1.5 rounded hover:bg-zinc-800"
              >
                {copiedCodeIndex === currentIndex ? "Copied!" : "Copy"}
              </button>
            </div>
            <pre className="p-3.5 overflow-x-auto font-mono text-xs text-zinc-200 leading-relaxed">
              <code>{currentCode}</code>
            </pre>
          </div>
        );
        codeBlockBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeBlockBuffer.push(line);
      return;
    }

    // Bullet points: - or *
    const bulletMatch = line.match(/^(\s*)[-*•]\s+(.*)$/);
    if (bulletMatch) {
      nodes.push(
        <div key={`bullet-${lineIdx}`} className="flex items-start gap-2.5 my-1 pl-1">
          <span className="mt-2.5 h-1.5 w-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 shrink-0" />
          <div className="flex-1 leading-relaxed">{renderInlineText(bulletMatch[2])}</div>
        </div>
      );
      return;
    }

    // Numbered lists: 1. 2.
    const numMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (numMatch) {
      nodes.push(
        <div key={`num-${lineIdx}`} className="flex items-start gap-2.5 my-1 pl-1">
          <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 min-w-4 text-right pt-0.5">
            {numMatch[2]}.
          </span>
          <div className="flex-1 leading-relaxed">{renderInlineText(numMatch[3])}</div>
        </div>
      );
      return;
    }

    // Headings (## or ###)
    const headingMatch = line.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      nodes.push(
        <div
          key={`heading-${lineIdx}`}
          className={`font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 mt-4 mb-1.5 ${
            level <= 2 ? "text-base" : "text-sm"
          }`}
        >
          {renderInlineText(headingMatch[2])}
        </div>
      );
      return;
    }

    // Paragraph spacing
    if (!line.trim()) {
      nodes.push(<div key={`empty-${lineIdx}`} className="h-2" />);
    } else {
      nodes.push(
        <div key={`line-${lineIdx}`} className="leading-relaxed my-0.5">
          {renderInlineText(line)}
        </div>
      );
    }
  });

  if (inCodeBlock && codeBlockBuffer.length > 0) {
    const currentCode = codeBlockBuffer.join("\n");
    nodes.push(
      <div
        key="code-unclosed"
        className="my-3 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950"
      >
        <pre className="p-3.5 overflow-x-auto font-mono text-xs text-zinc-200">
          <code>{currentCode}</code>
        </pre>
      </div>
    );
  }

  return <div className="space-y-0.5">{nodes}</div>;
}

export default function ChatBox({
  projectId,
  projectTitle,
  projectDescription,
  className,
}: ChatBoxProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Smoothly scroll to the bottom of the conversation
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Adjust textarea height dynamically up to 180px
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        180
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

  const handleCopyMessage = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(id);
      setTimeout(() => {
        setCopiedMessageId((prev) => (prev === id ? null : prev));
      }, 2000);
    } catch {
      // Fallback
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setErrorMessage(null);
    const userMessage: ChatMessage = {
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : String(Date.now()),
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
      let clientDate: string | undefined;
      try {
        clientDate = new Intl.DateTimeFormat("en-US", {
          dateStyle: "full",
          timeStyle: "short",
        }).format(new Date());
      } catch {
        // Fallback
      }

      const response = await apiFetch("/api/chat", {
        method: "POST",
        timeoutMs: CHAT_CLIENT_TIMEOUT_MS,
        body: JSON.stringify({
          message: trimmed,
          project_id: projectId,
          client_date: clientDate,
        }),
      });

      // 1. Session expired
      if (response.status === 401) {
        const returnUrl =
          typeof window !== "undefined" ? window.location.pathname : "/dashboard";
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
          // fallback
        }
        setErrorMessage(msg);
        return;
      }

      // 3. Service outage (HTTP 503)
      if (response.status === 503) {
        let msg = "The AI service is busy. Please try again shortly.";
        try {
          const data = await response.json();
          if (data?.detail) msg = data.detail;
        } catch {
          // fallback
        }
        setErrorMessage(msg);
        return;
      }

      // 4. Non-200 responses
      if (!response.ok) {
        let msg = "An unexpected error occurred while communicating with the AI service.";
        try {
          const data = await response.json();
          if (data?.detail) msg = data.detail;
        } catch {
          // fallback
        }
        setErrorMessage(msg);
        return;
      }

      // 5. Success
      const data = await response.json();
      const reply = typeof data?.reply === "string" ? data.reply : "";

      const assistantMessage: ChatMessage = {
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : String(Date.now() + 1),
        role: "assistant",
        content: reply,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: unknown) {
      if (err instanceof ApiAuthError) {
        const returnUrl =
          typeof window !== "undefined" ? window.location.pathname : "/dashboard";
        router.push(`/login?next=${encodeURIComponent(returnUrl)}`);
        return;
      }

      if (
        err instanceof ApiTimeoutError ||
        (err instanceof Error && err.name === "ApiTimeoutError")
      ) {
        setErrorMessage(
          "The request timed out while the assistant was processing tools. Please try again."
        );
        return;
      }

      if (
        err instanceof ApiNetworkError ||
        (err instanceof Error && err.name === "ApiNetworkError")
      ) {
        setErrorMessage(
          "Unable to connect to the assistant service. Please check your network connection or verify the backend is running."
        );
        return;
      }

      setErrorMessage(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while processing your request. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestedPrompt = (promptText: string) => {
    setInput(promptText);
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        180
      )}px`;
    }
  };

  return (
    <div
      className={`flex flex-col h-full w-full overflow-hidden bg-transparent ${
        className || ""
      }`}
    >
      {/* Scrollable Conversation Canvas */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 md:px-8 py-8 scroll-smooth">
        <div className="max-w-3xl mx-auto w-full space-y-7">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-16 sm:py-24 px-4 animate-in fade-in duration-300">
              {/* Minimalist AI Icon */}
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm mb-6">
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="1.75"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
                  />
                </svg>
              </div>

              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                What are you working on today?
              </h2>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 max-w-md leading-relaxed">
                {projectTitle
                  ? `Ask questions, draft technical roadmaps, calculate estimates, or analyze ideas for "${projectTitle}".`
                  : "Your intelligent workspace assistant for contextual reasoning, research, and productivity."}
              </p>

              {/* Minimalist, subtle prompt suggestions */}
              <div className="mt-8 flex flex-wrap items-center justify-center gap-2 max-w-xl">
                {[
                  `Draft an executive summary for ${projectTitle || "this project"}`,
                  "Outline key technical deliverables and milestones",
                  "Identify potential architectural trade-offs and risks",
                  "Calculate budget allocation with 15% contingency buffer",
                ].map((promptText, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSuggestedPrompt(promptText)}
                    disabled={isLoading}
                    className="rounded-full border border-zinc-200/90 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/60 px-4 py-2 text-xs text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition shadow-2xs focus-visible:outline-2 focus-visible:outline-blue-500"
                  >
                    {promptText}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col group ${
                  msg.role === "user" ? "items-end" : "items-start"
                }`}
              >
                {/* Author Info */}
                <div className="flex items-center gap-2 mb-1 px-1">
                  <span className="text-2xs font-medium text-zinc-500 dark:text-zinc-400">
                    {msg.role === "user" ? "You" : "CortexDesk AI"}
                  </span>
                  <span className="text-3xs text-zinc-400 dark:text-zinc-500">
                    {msg.timestamp.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                {/* Message Content Body */}
                {msg.role === "user" ? (
                  <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-tr-xs bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words shadow-2xs">
                    {msg.content}
                  </div>
                ) : (
                  <div className="w-full max-w-full text-zinc-800 dark:text-zinc-200 text-sm leading-relaxed whitespace-pre-wrap break-words pt-1 pb-2">
                    <FormattedMessage content={msg.content} />

                    {/* Subtle message action bar */}
                    <div className="mt-2.5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(msg.id, msg.content)}
                        className="inline-flex items-center gap-1 text-3xs font-medium text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300 transition py-1 px-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800/80"
                        aria-label="Copy message text"
                      >
                        {copiedMessageId === msg.id ? (
                          <>
                            <svg
                              className="h-3 w-3 text-emerald-600 dark:text-emerald-400"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth="2.5"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M4.5 12.75l6 6 9-13.5"
                              />
                            </svg>
                            <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <svg
                              className="h-3 w-3"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"
                              />
                            </svg>
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}

          {/* Smooth Thinking Indicator */}
          {isLoading && (
            <div className="flex flex-col items-start space-y-1.5">
              <span className="text-2xs font-medium text-zinc-500 dark:text-zinc-400 px-1">
                CortexDesk AI
              </span>
              <div
                role="status"
                aria-live="polite"
                className="inline-flex items-center gap-2 py-1.5 px-3 rounded-full bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-600 dark:text-zinc-300"
              >
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
                <span className="text-2xs">Thinking…</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Error Feedback Banner */}
      {errorMessage && (
        <div className="px-4 sm:px-6 md:px-8 py-2 max-w-3xl mx-auto w-full">
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 sm:p-3.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200 shadow-2xs"
          >
            <div className="flex items-start gap-2.5">
              <svg
                className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5"
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
              <span className="leading-snug break-words">{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="shrink-0 text-amber-700 hover:text-amber-950 dark:text-amber-300 dark:hover:text-amber-100 p-1"
              aria-label="Dismiss alert"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Elevated Floating Composer Area */}
      <div className="shrink-0 p-4 sm:p-6 bg-gradient-to-t from-zinc-50 via-zinc-50/90 to-transparent dark:from-zinc-950 dark:via-zinc-950/90 dark:to-transparent">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto w-full">
          <div className="relative rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm focus-within:ring-2 focus-within:ring-zinc-900/10 dark:focus-within:ring-zinc-100/10 focus-within:border-zinc-400 dark:focus-within:border-zinc-600 transition-all p-3 sm:p-3.5">
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
              placeholder="Message CortexDesk... (Shift+Enter for new line)"
              disabled={isLoading}
              className="w-full resize-none border-0 bg-transparent px-1 py-1 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none dark:text-zinc-100 dark:placeholder-zinc-500 disabled:opacity-60 max-h-44 min-h-[44px] leading-relaxed"
            />

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 mt-1">
              <div className="flex items-center gap-2 text-3xs text-zinc-400 dark:text-zinc-500">
                <span className="hidden sm:inline">
                  <kbd className="font-mono rounded bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5">
                    Enter
                  </kbd>{" "}
                  send ·{" "}
                  <kbd className="font-mono rounded bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5">
                    Shift+Enter
                  </kbd>{" "}
                  line
                </span>
                {input.trim().length > 0 && (
                  <span className="font-mono">{input.length} chars</span>
                )}
              </div>

              <div className="flex items-center gap-2 ml-auto">
                {input.trim().length > 0 && !isLoading && (
                  <button
                    type="button"
                    onClick={() => {
                      setInput("");
                      if (textareaRef.current) {
                        textareaRef.current.style.height = "auto";
                      }
                    }}
                    className="text-3xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 px-2 py-1 rounded transition"
                  >
                    Clear
                  </button>
                )}

                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  aria-label={isLoading ? "Processing request" : "Send message"}
                  className="inline-flex items-center justify-center rounded-xl bg-zinc-900 h-8 px-3.5 text-xs font-medium text-white shadow-xs transition hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 active:scale-95 shrink-0"
                >
                  {isLoading ? (
                    <svg
                      className="h-3.5 w-3.5 animate-spin text-current"
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
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span>Send</span>
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"
                        />
                      </svg>
                    </div>
                  )}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
