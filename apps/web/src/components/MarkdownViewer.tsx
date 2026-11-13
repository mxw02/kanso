import React from 'react';
import ReactMarkdown from 'react-markdown';

interface Props {
  content: string;
  className?: string;
}

export const MarkdownViewer: React.FC<Props> = ({ content, className = '' }) => {
  return (
    <div className={`prose prose-slate prose-sm max-w-none text-zinc-700 leading-relaxed ${className}`}>
      <ReactMarkdown
        components={{
          h1: ({ node, ...props }) => <h1 className="text-base font-bold text-zinc-900 mb-2 mt-3" {...props} />,
          h2: ({ node, ...props }) => <h2 className="text-sm font-semibold text-zinc-900 mb-1.5 mt-2" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-800 mb-1 mt-2" {...props} />,
          p: ({ node, ...props }) => <p className="mb-2 last:mb-0 text-xs leading-relaxed text-zinc-700" {...props} />,
          ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-2 last:mb-0 space-y-1 text-xs text-zinc-700" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-2 last:mb-0 space-y-1 text-xs text-zinc-700" {...props} />,
          li: ({ node, ...props }) => <li className="text-xs leading-relaxed" {...props} />,
          a: ({ node, ...props }) => <a className="text-teal-700 hover:underline font-medium" target="_blank" rel="noreferrer" {...props} />,
          img: ({ node, alt, src, ...props }) => (
            <a href={src} target="_blank" rel="noreferrer" className="block my-2">
              <img
                src={src}
                alt={alt || 'Bild'}
                loading="lazy"
                className="max-h-96 rounded-xl border border-zinc-200 bg-zinc-50 object-contain shadow-2xs hover:border-teal-400 transition"
                {...props}
              />
            </a>
          ),
          code: ({ node, className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match && !String(children).includes('\n');
            if (isInline) {
              return (
                <code className="bg-zinc-100 text-teal-800 font-mono text-[11px] px-1.5 py-0.5 rounded border border-zinc-200" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <pre className="bg-zinc-900 border border-zinc-800 p-3 rounded-lg text-emerald-400 font-mono text-[11px] overflow-x-auto my-2">
                <code>{children}</code>
              </pre>
            );
          },
          blockquote: ({ node, ...props }) => (
            <blockquote className="border-l-2 border-teal-600 pl-3 italic text-zinc-500 my-2 text-xs" {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
