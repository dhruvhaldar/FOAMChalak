# FOAMFlask Design System

## Overview
FOAMFlask uses a **Liquid Glass** aesthetic—a modern, scientific persona that prioritizes data density, clarity, and visual depth. The interface feels lightweight and immersive, using glassmorphism (backdrop filters and semi-transparency) to maintain a connection with the dynamic gradient background. It is designed for engineers and researchers who need a professional tool for OpenFOAM simulation management.

## Colors
- **Primary** (#0e7490): Cyan-700. Used for navigational elements (navbar), primary simulation actions, and brand identity.
- **Secondary** (#0ea5e9): Cyan-500. Used for secondary interactive elements, highlights, and toggle states.
- **Tertiary** (#22c55e / #ef4444): Success and Error states. Green-500 for "Run/Create" success, Red-500 for "Delete/Stop" or failures.
- **Neutral** (#000000 / #ffffff): Pure black for text contrast and white for glass panel foundations.
- **Background** (grad): A vertical linear gradient from `hsla(192,100%,86%,1)` (top) to `hsla(292,37%,88%,1)` (bottom).

The design also utilizes "Liquid" naming for glass variations:
- **Clear Liquid Glass**: `rgba(255, 255, 255, 0.15)` with 0px blur.
- **Matte Liquid Panel**: `rgba(255, 255, 255, 0.55)` with 16px blur (primary container style).

## Typography
- **Headline Font**: Inter
- **Body Font**: Inter
- **Label Font**: Inter

Hierarchy:
- **Headlines**: Semi-bold to Bold (700). 24px (H1) down to 18px (H3).
- **Body**: Regular (400) at 16px. Used for descriptions and long-form data.
- **Data/Logs**: Regular (400) at 14px (sm) with high-contrast background for readability.
- **Labels**: Medium (500) at 12px-14px for input headers and metadata.

The use of a single font family (Inter) ensures a cohesive, technical look across the application.

## Elevation
Depth is primarily conveyed through **Glassmorphism** rather than traditional drop shadows.
- **Surfaces**: `backdrop-filter: blur(16px)` creates separation between layers.
- **Borders**: `1px solid rgba(255, 255, 255, 0.5)` defines the edges of panels.
- **Shadows**: Only subtle shadows (`box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05)`) are used to ground panels against the background.

## Components
- **Glass Panels**: The core container. Rounded (12px-16px), semi-transparent white fills, and internal padding.
- **Buttons**: Rounded-lg (8px). Primary uses high-saturation cyan fills; secondary uses outlines or lighter cyan tints. Smooth CSS transitions (0.2s - 0.3s) for all states.
- **Inputs**: 1px borders with rounded-md (6px). Active focus states use a cyan-500 ring with 2px offset.
- **Navigation**: Persistent top bar with a rounded "sliding pill" indicator to highlight the active section.

## Do's and Don'ts
- **Do** maintain WCAG AA contrast ratios for all simulation data and log text.
- **Do** use the Primary Cyan color for the "Master Action" on each page (e.g., "Run Command").
- **Do** use glassmorphism to group logical sections (Setup, Geometry, Meshing).
- **Don't** use opaque backgrounds for main panels; always allow some background bleed-through.
- **Don't** mix multiple font families; stick to the Inter hierarchy.
- **Don't** use heavy, dark shadows; keep elevation lightweight.
