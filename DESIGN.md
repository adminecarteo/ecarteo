---
version: alpha
name: Écartéo
description: A factual bilingual audit workspace with a floating navy rail and analytical evidence surfaces.
colors:
  primary: '#181B52'
  signal: '#27D4D7'
  aqua: '#81E0E4'
  background: '#F5F8FB'
  surface: '#FFFFFF'
  text: '#12172D'
  muted: '#5A6180'
  border: '#DCE2EB'
  accent: '#0A8589'
  success: '#16875A'
  warning: '#A9600B'
  danger: '#C23A31'
  critical: '#8A1D52'
typography:
  sans:
    fontFamily: 'Inter, system-ui, sans-serif'
  mono:
    fontFamily: 'IBM Plex Mono, ui-monospace, monospace'
  print:
    fontFamily: 'Helvetica, Helvetica-Bold, Arial, EcarteoArabic, EcarteoHan, sans-serif'
rounded:
  DEFAULT: '9px'
  card: '14px'
  rail: '16px'
spacing:
  page-max: '1440px'
  rail: '240px'
  page-gap: '20px'
  card-padding: '18px'
components:
  button:
    backgroundColor: '{colors.signal}'
    textColor: '{colors.text}'
  card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
  field:
    textColor: '{colors.muted}'
  dialog:
    backgroundColor: '{colors.surface}'
  table:
    textColor: '{colors.text}'
  evidence:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
  success-badge:
    textColor: '{colors.success}'
  warning-badge:
    textColor: '{colors.warning}'
  danger-badge:
    textColor: '{colors.danger}'
  critical-badge:
    textColor: '{colors.critical}'
  brand:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.signal}'
  divider:
    backgroundColor: '{colors.border}'
  link:
    textColor: '{colors.accent}'
---

# Écartéo design system

## Overview

The supplied Écartéo Console HTML is the visual source of truth. Preserve its floating navy navigation rail, restrained cyan emphasis, analytical cards, weighted criterion bars, and severity language. The 2026 deployment dossier supplies business context. Product/admin register; quality managers, operators and client representatives in the French B2B market. French and English UI/content, French default. Desktop daily work with mobile access. No Japan-market scope.

The signature is the navy rail and offset-bar Écartéo mark. Familiar controls and factual evidence take priority over decorative additions. The console preserves that supplied layout. The new public website extends the same identity into a restrained editorial surface. Avoid illustration-heavy cards, gradients or invented metrics.

Runtime source: `src/app/globals.css` owns tokens. This document mirrors the original prototype values; change both together. Reusable owners live in `src/components/ui.tsx`; feature code consumes variables, never independent themes. Original `--brand` maps to primary, `--signal` to signal, `--bg` to background, `--surface` to surface, `--ink` to text, `--muted` to muted, `--line` to border. Semantic dark overrides live in the same stylesheet.

## Colors

Aqua is retained from the supplied brand palette as a reserved token. Navy is navigation/report identity, cyan is the principal action and selected state. White surfaces sit on the cool analytical background. Muted teal is accessible accent text. Green/orange/red/magenta represent conforming/fragile/loss/critical with visible text labels, never color alone. Dark mode preserves this hierarchy. Forced colors uses system borders and scrollbars.

## Typography

Locally bundled Inter regular/medium/semibold/bold for headings and content; IBM Plex Mono for elapsed time and compact numeric labels. Body14px, page title26px, section17px, utility11–13px. Tabular numerals for scores and dates. Fonts ship with the app, without remote font requests. French accents must render in all interfaces and PDF output.

PDF export intentionally uses the renderer's built-in `Helvetica` and `Helvetica-Bold` typefaces for French/English. Chinese content loads the locally bundled static `EcarteoHan` fallback derived from Noto Sans SC. Arabic reports use the browser-print path with locally bundled `EcarteoArabic` (Amiri), Arial for Latin text and EcarteoHan when needed, because the native PDF renderer corrupts Arabic text extraction. These are print-only typefaces, documented in `docs/PDF-LANGUAGES.md`; website and console typography remain Inter and IBM Plex Mono. No remote font requests occur during export.

## Layout

Original desktop max1440px; rail240px, gutter20px, cards18px padding. Document owns vertical scrolling; tables own horizontal overflow. Two/four-column analytics collapse on narrow screens. Mobile navigation has an explicit expandable menu. Form steps wrap; all actions stay reachable. Tables paginate; action lists have visible scrolling. No page-wide overflow hiding.

## Elevation & Depth

Source subtle card shadow and 1px border. The report header uses a solid navy surface. Dialog overlays alone add blocking depth; toast sits above app content without reflow.

## Shapes

Controls9px, cards14px, rail/dialog16px; chips compact. Preserve original evidence and score-bar geometry. Small circular status marks accompany labels.

## Components

Shared Button supports primary/secondary/danger/ghost and compact size; visible hover, keyboard focus, busy and disabled states. Card, Field, EmptyState, PageHeader, ScoreBadge, StatusBadge, Pagination, EvidenceCard and ConfirmDialog are canonical. Native select/date popups intentionally use browser/OS behavior. Labels, errors and descriptions belong to fields. Dialog uses Radix focus management; least-destructive Cancel initially focused. No native alert/confirm/prompt.

SVG chart is code-native with accessible title containing values. PDF report uses a dedicated print renderer. Brand SVG is faithfully reconstructed from supplied HTML; navigation remains text-led. Motion is limited to short feedback and loading; prefers-reduced-motion disables movement. Copy stays factual, constructive and bilingual.

## Do's and Don'ts

- Do preserve the supplied palette, content hierarchy and eight sections.
- Do use authenticated identity in the console; reserve fictional content for clearly labeled public illustrations and isolated test fixtures.
- Do use the same primitives for equivalent actions across screens.
- Don't add invented customers, results, illustrations, or commercial claims.
- Don't expose draft observations to the client preview or change approved reports.

## Public website and authentication

The SaaS extension adds `/`, `/methode`, `/offres`, `/login`, `/signup`, `/forgot-password`, and `/reset-password`; the authenticated console moves to `/app`. The generated design concept established a white header, navy two-column hero, light four-row observation-to-retest preview, four open method stages, three offer rows and navy footer. All controls and evidence illustrations are code-native. The supplied offset-bar identity overrides the concept’s approximate logo, with one canonical `src/components/brand-mark.tsx` owner shared across surfaces.

`src/components/marketing/marketing.module.css` owns the fixed light public variant; `src/components/auth/auth.module.css` owns the matching split account layout. They use the exact established brand palette and do not inherit a user's console dark preference. The public frame is 1200px, the auth frame 1120px. Public heading sizes are 50px/36px; account headings 34px, reducing on mobile. Marketing header collapses to an explicit menu. Account mobile preserves the brand and puts the form first, removing the long explanatory rail. Both reset document padding only while their scoped page is rendered.

Authentication uses the same labeled input/reveal/busy/error primitives across modes. The activation notice is an intentional configuration state, not a design placeholder; the submit control stays disabled without a configured provider. No false login success, demo role switch or fictional account is used. Forms do not store passwords in browser persistence. Public offer copy is factual, with no fake customer metrics, testimonials, compliance badges or automatic charges.

Visual verification compared the generated concept with rendered desktop screenshots and inspected 390px mobile layouts. Landing and auth screenshots are QA outputs, not runtime assets.

## Transactional email

`supabase/templates/confirmation.html` and `recovery.html` adapt the public identity to email clients: navy header and text-only Écartéo wordmark, cyan action buttons, white 600px fluid surface and cool background. Inline values map to the existing primary, signal, background, surface, text, muted, border and accent tokens; email clients cannot rely on the app's CSS variables. Arial/Helvetica are intentional email-only fallbacks. Presentation tables and inline styles keep content usable without external fonts, images, scripts or tracking. French appears first, followed by complete English guidance. Each language's action and the shared readable fallback use the same `.SiteURL` / `.TokenHash` authentication link. Changing appearance must preserve the signup/recovery link contract.
