# Devcrew Design System

## Purpose

This document defines the official visual and interaction language for every Devcrew user-facing surface. It establishes design intent and decision rules without prescribing implementation CSS. `devcrew-ui` applies these rules, `devcrew-review` verifies them, and `devcrew` validates their consistency after integration.

## UI Philosophy

Devcrew is an engineering workspace, not a collection of dashboards or chat windows. The interface must make project context, ownership, work state, and the next available action clear with minimal visual noise.

The design is calm, warm, dark-first, and typography-led. Density should support serious work without becoming crowded. Decoration is subordinate to information hierarchy. Guildly informs these principles but is not a component, layout, or copy template.

## Interaction Philosophy

- Preserve context. Project, section, selected record, and relevant lifecycle state should remain evident during navigation.
- Prefer direct, reversible actions. Make destructive or high-impact actions deliberate and confirm them in proportion to risk.
- Make system state visible. Queued, active, stopped, completed, failed, disabled, saving, and unsaved states require distinct language and non-color cues.
- Use progressive disclosure. Keep primary work clear while making advanced configuration available where it is needed.
- Keep feedback close to the action that caused it and explain recovery when an operation fails.
- Do not simulate progress or success. Interface state must correspond to authoritative product state.
- Design keyboard, pointer, touch, and assistive-technology behavior as parts of the same interaction.

## Typography

The type system has three functional families:

- A restrained serif display face for major page titles and rare editorial moments.
- A highly legible sans-serif face for navigation, controls, labels, body text, tables, and forms.
- A monospace face for code, identifiers, commands, structured events, and technical values.

Hierarchy must come from a limited, named type scale with consistent size, weight, line height, and tracking. A page should normally have one dominant heading. Labels and metadata remain legible without competing with primary content. Uppercase text is reserved for short categorical labels and must not become the default hierarchy device.

Text measure should support scanning and reading: prose uses a constrained line length, while operational tables and timelines use available width deliberately. Truncation must not hide information required to understand or act; provide an accessible way to reveal the full value.

## Spacing

Spacing uses a shared base increment and a small semantic scale rather than arbitrary values. Tokens cover inline separation, control padding, component padding, group separation, section separation, and page margins.

Related elements remain closer than unrelated groups. Repeated components use identical internal spacing. Dense operational surfaces may use the compact end of the scale, but touch targets, legibility, and focus visibility must not be reduced. Large empty areas are intentional only when they clarify hierarchy or focus.

## Grid and Layout

The application uses a persistent navigation region and a flexible content region. Layout must preserve stable navigation and visible project context while allowing work surfaces to adapt.

- Page content follows a consistent alignment grid and maximum readable width appropriate to the content type.
- Forms use predictable label and field alignment.
- Detail views distinguish primary content from supporting metadata without fragmenting the page into excessive cards.
- Tables, timelines, and boards may use wider working areas than prose or settings.
- Responsive behavior prioritizes task completion, then adapts navigation and secondary detail without removing essential actions.
- Horizontal scrolling is limited to content whose structure genuinely requires it and must not become the default small-screen strategy.

## Radius

Radius communicates component role, not decoration. The system uses a compact scale:

- Small radius for controls, tags, and compact interactive elements.
- Standard radius for panels, menus, fields, and dialogs.
- Full radius only for status dots, avatars, and deliberately pill-shaped controls.

Nested elements must not accumulate incompatible radii. Large ornamental rounding that wastes space or makes the product feel playful is outside the design language.

## Elevation

The dark theme establishes hierarchy primarily through surface tone, border, and spacing. Shadow is reserved for transient layers such as menus, popovers, dialogs, and drag states.

Elevation levels must be few, named, and tied to stacking behavior. A higher visual layer must correspond to a higher interaction layer. Persistent content should not use shadow to imitate floating cards. Focus rings, borders, and overlays must remain visible against every permitted surface.

## Dark Theme Philosophy

Dark mode is the primary visual expression. It uses warm charcoal and brown-influenced neutrals instead of pure black. Text uses softened whites rather than maximum white. Surface differences are subtle but perceptible, and borders provide quiet structure.

Dark-first does not mean dark-only. The semantic token model must support a coherent light theme without changing component meaning or interaction. User preference and system preference behavior must be predictable, and theme transitions must not flash or conceal content.

## Color System

Color is semantic and restrained:

- Neutral colors define canvas, surfaces, overlays, borders, primary text, secondary text, and disabled content.
- A warm orange accent identifies primary actions, selection, focus support, and limited brand emphasis.
- Status families communicate informational, successful, warning, destructive, and active states.
- Data visualization colors are selected for differentiation, contrast, and compatibility with color-vision deficiencies.

No status or selection may depend on color alone. Saturated color is limited to states that require attention. Accent color is not a substitute for hierarchy. Text and interactive contrast must meet the accessibility target in `spec.md` across default, hover, focus, active, disabled, and error states.

## Component Principles

- Build components around product responsibilities and repeatable interaction, not screenshots.
- Prefer composition over large components with many unrelated variants.
- Every interactive component defines default, hover, focus-visible, active, disabled, loading, validation, and error behavior where applicable.
- Loading states preserve layout and describe meaningful progress; skeletons are used only when they improve comprehension.
- Empty states explain why content is absent and offer a relevant next action when one exists.
- Error states use plain language, preserve user input where safe, and identify recovery.
- Dialogs are reserved for focused decisions or tasks that should interrupt the current flow.
- Tables support scanning, clear headers, keyboard use, and responsive alternatives appropriate to their data.
- Icons reinforce labels or represent universally understood actions; they do not carry essential meaning without an accessible name.

## Motion Principles

Motion explains relationship, change, and causality. It must feel calm and unobtrusive.

- Use short transitions for control feedback and modest transitions for navigation or panel changes.
- Use consistent easing tokens based on entering, exiting, and state-change intent.
- Avoid continuous decorative animation, exaggerated spring effects, parallax, and motion that delays access to content.
- Preserve spatial continuity when items move between work states.
- Never use animation as the only indication that a state changed.
- Honor reduced-motion preferences by removing non-essential movement and replacing essential motion with immediate, understandable state changes.

## Accessibility

The design system targets WCAG 2.2 Level AA and treats accessibility as a component requirement.

- Use semantic HTML and established interaction patterns before custom behavior.
- Maintain logical heading order, landmarks, labels, descriptions, and control names.
- Provide complete keyboard access and a visible, consistent focus indicator.
- Manage focus deliberately for dialogs, menus, route changes, validation, and dynamically inserted content.
- Ensure text, controls, icons, charts, and states meet applicable contrast requirements.
- Support zoom, text resizing, reflow, long content, and target sizes without loss of function.
- Announce asynchronous status and errors at an appropriate urgency without producing excessive screen-reader output.
- Provide alternatives for images and visualized data; mark decorative imagery accordingly.

Automated checks are necessary but do not replace manual keyboard and assistive-technology-oriented review.

## Design Tokens

Tokens are named by semantic purpose so theme and component implementations can change without changing meaning. The conceptual token groups are:

| Group | Examples of meaning |
| --- | --- |
| Color | Canvas, surface, elevated surface, border, text, muted text, accent, focus, status, overlay. |
| Typography | Display, heading, body, label, caption, code; family, size, weight, line height, tracking. |
| Space | Inline, control, component, group, section, page. |
| Size | Control height, target size, icon size, sidebar width, content measure. |
| Radius | Small, standard, full. |
| Elevation | Base, raised, overlay, modal. |
| Motion | Instant, fast, standard, deliberate; enter, exit, state easing. |
| Layout | Breakpoint, gutter, content width, wide workspace width, stacking layer. |

Components consume semantic tokens rather than hard-coded visual values. Raw palette and measurement values may exist beneath the semantic layer, but product components must not depend directly on them when a semantic token applies.

## Consistency Rules

- Use the shared component and token vocabulary before creating a new pattern.
- The same product state uses the same label, color meaning, icon treatment, and interaction across every page.
- Primary actions occupy a predictable location and no surface presents competing primary actions without clear hierarchy.
- Navigation, page headers, forms, tables, filters, status markers, notifications, and dialogs follow common anatomy.
- Copy is concise, specific, and operational. Avoid promotional language and unexplained technical errors.
- Responsive changes preserve action order and meaning.
- Exceptions require a documented user need and design review; one-off preference is not sufficient.
- Review new patterns across representative content, themes, viewport sizes, input methods, loading states, and failure states before adoption.
