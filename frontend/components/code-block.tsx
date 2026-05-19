"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/clipboard";

const KEYWORD_RE = /\b(?:curl|export|source|alias|echo|cat|grep|sed|awk|python|node|npm|yarn|pnpm|git|docker)\b/g;
const STRING_RE = /("[^"]*"|'[^']*')/g;
const FLAG_RE = /(?<=\s)(--?[a-zA-Z0-9_-]+)/g;
const HEADER_RE = /(?<=\s)(-H|--header)(?=\s)/g;
const URL_RE = /(https?:\/\/[^\s"'\\]+)/g;
const COMMENT_RE = /(\\\\.*|#.*)/g;
const JSON_KEY_RE = /("(?:[^"\\]|\\.)*")\s*:/g;
const JSON_BOOL = /\b(?:true|false|null)\b/g;
const JSON_NUM = /(?<=:\s*)(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

interface Token {
  text: string;
  className: string;
}

function tokenizeBash(code: string): Token[] {
  const tokens: Token[] = [];
  let remaining = code;

  while (remaining.length > 0) {
    let matched = false;

    const patterns: [RegExp, string][] = [
      [COMMENT_RE, "token-comment"],
      [STRING_RE, "token-string"],
      [URL_RE, "token-url"],
      [HEADER_RE, "token-header"],
      [FLAG_RE, "token-flag"],
      [KEYWORD_RE, "token-keyword"],
    ];

    let earliest: { index: number; match: string; className: string } | null = null;
    for (const [re, className] of patterns) {
      re.lastIndex = 0;
      const m = re.exec(remaining);
      if (m && (earliest === null || m.index < earliest.index)) {
        earliest = { index: m.index, match: m[0], className };
      }
    }

    if (earliest && earliest.index < remaining.length) {
      if (earliest.index > 0) {
        tokens.push({ text: remaining.slice(0, earliest.index), className: "token-plain" });
      }
      tokens.push({ text: earliest.match, className: earliest.className });
      remaining = remaining.slice(earliest.index + earliest.match.length);
    } else {
      tokens.push({ text: remaining, className: "token-plain" });
      break;
    }
  }

  return tokens;
}

function tokenizeJson(code: string): Token[] {
  const tokens: Token[] = [];
  let remaining = code;

  while (remaining.length > 0) {
    const patterns: [RegExp, string][] = [
      [JSON_KEY_RE, "token-json-key"],
      [STRING_RE, "token-json-string"],
      [JSON_BOOL, "token-json-bool"],
      [JSON_NUM, "token-json-num"],
    ];

    let earliest: { index: number; match: string; className: string } | null = null;
    for (const [re, className] of patterns) {
      re.lastIndex = 0;
      const m = re.exec(remaining);
      if (m) {
        const idx = m.index + (className === "token-json-key" ? 0 : m[0].indexOf(m[1]));
        if (earliest === null || (idx >= 0 && idx < earliest.index)) {
          earliest = { index: className === "token-json-key" ? m.index : m.index + m[0].indexOf(m[1]), match: m[1], className };
        }
      }
    }

    if (earliest && earliest.index < remaining.length && earliest.index >= 0) {
      if (earliest.index > 0) {
        tokens.push({ text: remaining.slice(0, earliest.index), className: "token-plain" });
      }
      tokens.push({ text: earliest.match, className: earliest.className });
      remaining = remaining.slice(earliest.index + earliest.match.length);
    } else {
      tokens.push({ text: remaining, className: "token-plain" });
      break;
    }
  }

  return tokens;
}

interface CodeBlockProps {
  code: string;
  language?: "bash" | "json";
  className?: string;
}

export function CodeBlock({ code, language = "bash", className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await copyToClipboard(code);
    setCopied(true);
    toast.success("已复制到剪贴板");
    setTimeout(() => setCopied(false), 2000);
  };

  const tokens = language === "json" ? tokenizeJson(code) : tokenizeBash(code);

  return (
    <div className={`group relative ${className}`}>
      <div className="absolute right-3 top-3 z-10">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleCopy}
          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-slate-200 hover:bg-white/10"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </Button>
      </div>
      <pre className="code-block language-bash overflow-x-auto">
        <code className="font-mono text-sm leading-relaxed">
          {tokens.map((token, i) => (
            <span key={i} className={token.className}>{token.text}</span>
          ))}
        </code>
      </pre>
    </div>
  );
}
