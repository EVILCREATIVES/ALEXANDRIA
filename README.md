# ALEXANDRIA

**ALEXANDRIA** is an AI-powered archival and research tool designed to ingest multilingual source materials, extract text and visual assets, and transform them into structured knowledge.

## Purpose

The platform automatically catalogs all extracted images, generating a short description (up to 100 words) together with available metadata such as author/creator and source reference. Images are then contextualized in two ways:

- **Geographically** — by mapping them onto a world map based on their depicted or production location
- **Historically** — by placing them within a timeline that connects the subject matter with the image's production date, publication date, or historical context

Using advanced vision models such as **Gemini**, ALEXANDRIA can identify the **subjects depicted in images, the artistic style, and potential narrative or historical connections**, helping researchers uncover relationships between images, events, and visual traditions.

## Core Workflow

ALEXANDRIA operates in four integrated steps:

1. **Ingestion** — Upload and import images and multilingual source content
2. **Archive Visualization** — View and catalog all extracted items with AI-generated descriptions and metadata
3. **Map** — Contextualize images geographically on an interactive world map
4. **Timeline** — Place images within a historical timeline with temporal context

Users can add notes and annotations to items when viewing them to enrich the archival record.

## Goal

**ALEXANDRIA** provides archivists and researchers with a powerful tool to **archive, analyze, and contextualize photographs, artworks, and visual materials across languages, places, and time.**

---

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## Deployment

The easiest way to deploy your app is to use the [Vercel Platform](https://vercel.com) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Tech Stack

- **Framework**: Next.js 15 with React
- **Language**: TypeScript
- **UI**: React with Tailwind CSS
- **Vision AI**: Gemini Vision API
- **file Storage**: Vercel Blob

