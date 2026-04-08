/** Design tokens — mirrors CSS custom properties from index.css */
export const theme = {
  bg: {
    base: 'var(--color-bg-base)',
    surface: 'var(--color-bg-surface)',
    elevated: 'var(--color-bg-elevated)',
  },
  border: {
    default: 'var(--color-border)',
    subtle: 'var(--color-border-subtle)',
  },
  text: {
    primary: 'var(--color-text-primary)',
    secondary: 'var(--color-text-secondary)',
    muted: 'var(--color-text-muted)',
    dim: 'var(--color-text-dim)',
  },
  accent: 'var(--color-accent)',
  accentBlue: 'var(--color-accent-blue)',
  success: 'var(--color-success)',
  error: 'var(--color-error)',
  errorBg: 'var(--color-error-bg)',
  errorBorder: 'var(--color-error-border)',
  errorText: 'var(--color-error-text)',
  warning: 'var(--color-warning)',
  successDark: 'var(--color-success-dark)',
  successBorder: 'var(--color-success-border)',
  onColor: 'var(--color-text-on-color)',
  radius: {
    sm: 'var(--radius-sm)',
    md: 'var(--radius-md)',
    lg: 'var(--radius-lg)',
  },
  font: {
    xs: 'var(--font-xs)',    // 11px — meta, hints, uppercase headers
    sm: 'var(--font-sm)',    // 12px — buttons, secondary UI
    base: 'var(--font-base)',// 13px — body text, panels
    lg: 'var(--font-lg)',    // 15px — titles, emphasis
  },
} as const
