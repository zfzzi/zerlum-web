# Design

## Design Direction

夜绘AI MVP 采用“专业工作台”方向：一个夜间照明工作室里的深色软件界面。使用近黑中性背景、靛紫主色、少量蓝色灯光反馈和暖白灯光强调。整体强调画布、参数、版本和导出，不做营销式首页。

## Color Tokens

Use OKLCH custom properties only.

- `--bg`: `oklch(0.075 0 0)`
- `--panel`: `oklch(0.115 0.014 270)`
- `--panel-strong`: `oklch(0.15 0.018 270)`
- `--panel-soft`: `oklch(0.105 0.01 250)`
- `--line`: `oklch(0.27 0.028 265)`
- `--line-soft`: `oklch(0.2 0.022 265)`
- `--text`: `oklch(0.93 0.012 260)`
- `--muted`: `oklch(0.68 0.02 255)`
- `--quiet`: `oklch(0.5 0.02 255)`
- `--primary`: `oklch(0.58 0.19 270)`
- `--primary-strong`: `oklch(0.64 0.2 268)`
- `--cyan`: `oklch(0.72 0.16 212)`
- `--warm`: `oklch(0.79 0.13 74)`
- `--danger`: `oklch(0.62 0.16 28)`

## Typography

Use a single product UI stack: `Inter`, `ui-sans-serif`, `system-ui`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `sans-serif`. Headings use weight and spacing, not display fonts. No negative letter spacing.

## Components

- Panels use 8px radius, 1px borders, no decorative wide shadows.
- Buttons use icon plus concise Chinese labels for commands.
- Toolbars are compact and stable, with selected, hover, focus, disabled and loading states.
- Sliders and segmented controls are the primary parameter controls.
- Cards are only used for repeated upload items, version thumbnails and compact status records.

## Layout

Desktop structure: fixed top bar, left asset/project rail, central canvas, right inspector, bottom version/export dock. Mobile structure stacks panels with inputs first, then canvas, then inspector controls.

## Motion

Motion is short and state-based: hover, selection, API loading progress and panel feedback. Use 150ms to 220ms transitions and disable non-essential motion for reduced-motion users.
