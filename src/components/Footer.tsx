import React from "react";

interface FooterProps {
  tvMode?: boolean;
}

const Footer = ({ tvMode }: FooterProps) => {
  const commitHash = process.env.NEXT_PUBLIC_COMMIT_HASH || "unknown";
  const shortHash = commitHash.slice(0, 7);
  const repoUrl = "https://github.com/Confiqure/polymarket-viewer";

  if (tvMode) return null;

  return (
    <footer className="mt-10 border-t border-neutral-800 bg-black pt-6 pb-12 text-center">
      <div className="mx-auto max-w-4xl px-4">
        <div className="text-sm text-neutral-400 sm:text-base">
          Made with{" "}
          <span role="img" aria-label="love" className="mx-1">
            ❤️
          </span>{" "}
          by{" "}
          <a
            href="https://dylanwheeler.net"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-neutral-700 underline-offset-4 hover:text-neutral-200 hover:decoration-neutral-400"
          >
            Dylan
          </a>
        </div>

        <div className="mt-4 flex flex-col items-center gap-3">
          <a
            href={repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 ring-1 ring-neutral-700 hover:ring-neutral-500 sm:text-sm"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-current">
              <path d="M12 .5C5.73.5.95 5.28.95 11.55c0 4.86 3.16 8.98 7.55 10.43.55.1.75-.24.75-.53 0-.26-.01-1.13-.02-2.05-3.07.67-3.72-1.31-3.72-1.31-.5-1.27-1.22-1.61-1.22-1.61-.99-.68.07-.66.07-.66 1.09.08 1.66 1.12 1.66 1.12.97 1.65 2.54 1.18 3.16.9.1-.7.38-1.18.69-1.45-2.45-.28-5.02-1.23-5.02-5.48 0-1.21.43-2.19 1.12-2.96-.11-.28-.49-1.41.11-2.93 0 0 .92-.29 3.02 1.13a10.5 10.5 0 0 1 2.75-.37c.93 0 1.86.12 2.75.37 2.1-1.42 3.02-1.13 3.02-1.13.6 1.52.22 2.65.11 2.93.69.77 1.12 1.75 1.12 2.96 0 4.26-2.58 5.2-5.04 5.47.39.34.73 1.01.73 2.04 0 1.47-.01 2.65-.01 3.01 0 .29.2.64.75.53 4.39-1.45 7.55-5.57 7.55-10.43C23.05 5.28 18.27.5 12 .5z" />
            </svg>
            View source on GitHub
          </a>

          {commitHash !== "unknown" && (
            <div className="flex items-center gap-2 text-xs text-neutral-600">
              <span>Build</span>
              <a
                href={`${repoUrl}/commit/${commitHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded bg-neutral-900 px-1.5 py-0.5 font-mono text-[10px] font-medium text-neutral-500 ring-1 ring-neutral-800 transition-all hover:text-neutral-300 hover:ring-neutral-700"
              >
                {shortHash}
              </a>
            </div>
          )}
        </div>
      </div>
    </footer>
  );
};

export default Footer;
