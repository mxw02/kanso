import React from 'react';
import ReactMarkdown from 'react-markdown';

interface Props {
  content: string;
  className?: string;
}

export const MarkdownViewer: React.FC<Props> = ({ content, className = '' }) => {
  return (
    <div className={`prose prose-invert prose-sm max-w-none text-zinc-300 leading-relaxed ${className}`}>
      <ReactMarkdown
        components={{
          h1: ({ node, ...props }) => <h1 className="text-base font-bold text-white mb-2 mt-3" {...props} />,
          h2: ({ node, ...props }) => <h2 className="text-sm font-semibold text-white mb-1.5 mt-2.5" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1 mt-2" {...props} />,
          p: ({ node, ...props }) => <p className="mb-2 text-xs leading-relaxed text-zinc-300" {...props} />,
          ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-2 space-y-1 text-xs text-zinc-300" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-2 space-y-1 text-xs text-zinc-300" {...props} />,
          li: ({ node, ...props }) => <li className="text-xs" {...props} />,
          code: ({ node, className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match && !String(children).includes('\n');
            if (isInline) {
              return (
                <code className="bg-zinc-800 text-indigo-300 font-mono text-[11px] px-1.5 py-0.5 rounded border border-zinc-700/60" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <pre className="bg-[#080a10] border border-zinc-800/80 p-2.5 rounded-lg text-emerald-400 font-mono text-[11px] overflow-x-auto my-2">
                <code>{children}</code>
              </pre>
            );
          },
          blockquote: ({ node, ...props }) => (
            <blockquote className="border-l-2 border-indigo-500 pl-3 italic text-zinc-400 my-2 text-xs" {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
