import React, { memo } from "react";

export const VerticalAlignTopIcon = memo(function VerticalAlignTopIcon({
  className,
}: {
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 4h16" />
      <path d="M8 20v-8a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v8" />
    </svg>
  );
});

export const VerticalAlignCenterIcon = memo(function VerticalAlignCenterIcon({
  className,
}: {
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12h16" />
      <path d="M8 6v12" />
      <path d="M16 8v8" />
    </svg>
  );
});

export const VerticalAlignBottomIcon = memo(function VerticalAlignBottomIcon({
  className,
}: {
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 20h16" />
      <path d="M8 4v8a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V4" />
    </svg>
  );
});
