/** @jsxImportSource react */
import type * as React from "react";
import { Download, Loader2, FolderOpen } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MarkdownBlock } from "../surface/markdown";

interface PreviewLoadingProps extends React.ComponentProps<"div"> {}

export function PreviewLoading({ className, ...props }: PreviewLoadingProps) {
  return (
    <div className={cn("flex h-full items-center justify-center text-muted-foreground", className)} {...props}>
      <Loader2 className="size-4 animate-spin" />
    </div>
  );
}

interface PreviewErrorProps extends React.ComponentProps<"div"> {
  message: string;
}

export function PreviewError({ message, className, ...props }: PreviewErrorProps) {
  return <div className={cn("p-4 text-sm text-muted-foreground", className)} {...props}>{message}</div>;
}

interface PlainTextProps extends React.ComponentProps<"pre"> {
  content: string;
}

export function PlainText({ content, className, ...props }: PlainTextProps) {
  return <pre className={cn("h-full overflow-auto p-4 text-xs leading-5 text-foreground whitespace-pre-wrap", className)} {...props}>{content}</pre>;
}

interface MarkdownPreviewProps extends React.ComponentProps<"div"> {
  content: string;
}

export function MarkdownPreview({ content, className, ...props }: MarkdownPreviewProps) {
  return (
    <div className={cn("h-full overflow-auto p-4", className)} {...props}>
      <MarkdownBlock text={content} />
    </div>
  );
}

interface TextHTMLPreviewProps {
  type: "text";
  title: string;
  content: string;
}

interface BinaryHTMLPreviewProps {
  type: "binary";
  title: string;
  url: string;
}

type HTMLPreviewProps = { className?: string } & (TextHTMLPreviewProps | BinaryHTMLPreviewProps);

export function HTMLPreview({ className, ...props }: HTMLPreviewProps) {
  if (props.type === "text") {
    return <iframe srcDoc={props.content} title={props.title} className={cn("h-full w-full border-0", className)} sandbox="allow-scripts allow-same-origin" />;
  }

  return <iframe src={props.url} title={props.title} className={cn("h-full w-full border-0", className)} sandbox="allow-scripts allow-same-origin" />;
}

interface ImagePreviewProps extends React.ComponentProps<"div"> {
  src: string;
  alt: string;
}

export function ImagePreview({ src, alt, className, ...props }: ImagePreviewProps) {
  return (
    <div className={cn("flex h-full items-center justify-center overflow-auto bg-muted/30 p-3", className)} {...props}>
      <img src={src} alt={alt} className="max-h-full max-w-full object-contain" />
    </div>
  );
}

interface PreviewUnavailableProps extends React.ComponentProps<"div"> {
  onDownload?: () => void;
  onReveal?: () => void;
}

export function PreviewUnavailable({ onDownload, onReveal, className, ...props }: PreviewUnavailableProps) {
  return (
    <div className={cn("flex flex-col h-full items-center justify-center p-6 text-center text-muted-foreground gap-4", className)} {...props}>
      <div className="text-sm font-medium">Preview is not available for this file type.</div>
      <div className="flex items-center gap-3">
        {onDownload && (
          <Button onClick={onDownload} variant="default" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            Download File
          </Button>
        )}
        {onReveal && (
          <Button onClick={onReveal} variant="outline" size="sm" className="gap-2">
            <FolderOpen className="h-4 w-4" />
            Reveal in Explorer
          </Button>
        )}
      </div>
    </div>
  );
}
