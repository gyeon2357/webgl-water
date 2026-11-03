import { clsx } from "clsx"

import s from "./skip.module.scss"

export const Skip = ({ visible, onClick }) => (
  <button
    type="button"
    className={clsx(s.skip, { [s.visible]: visible })}
    onClick={onClick}
  >
    Skip
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14M5 12l7 7 7-7" />
    </svg>
  </button>
)
