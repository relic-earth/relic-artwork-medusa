import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createProductsWorkflow, createCollectionsWorkflow } from "@medusajs/medusa/core-flows"
import artwork from "./data.json"

type ArtworkRow = {
  sku: string
  title: string
  series: string
  w: number
  h: number
  size: string
  price: number
  img: string
  handle: string
}

const ROWS = artwork as ArtworkRow[]

/**
 * One-time / idempotent seed endpoint for the X9 artwork catalog migrated
 * from Shopify. Protected by a shared secret (reuses ADMIN_PASSWORD) since
 * the free Render plan has no shell / one-off jobs to run `medusa exec`.
 *
 * POST /admin/seed-artwork
 * Header: x-seed-secret: <ADMIN_PASSWORD>
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const secret = req.headers["x-seed-secret"]
  if (!secret || secret !== process.env.ADMIN_PASSWORD) {
    res.status(401).json({ error: "unauthorized" })
    return
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const salesChannelModule = req.scope.resolve(Modules.SALES_CHANNEL)

  const channels = await salesChannelModule.listSalesChannels({})
  const defaultChannel = channels[0]
  if (!defaultChannel) {
    res.status(500).json({ error: "no sales channel found" })
    return
  }

  // 1. Collections — one per artwork series, created only if missing.
  const seriesNames = Array.from(new Set(ROWS.map((r) => r.series)))
  const { data: existingCollections } = await query.graph({
    entity: "product_collection",
    fields: ["id", "handle"],
  })
  const existingHandles = new Set(existingCollections.map((c: any) => c.handle))

  const collectionsToCreate = seriesNames
    .map((name) => ({
      title: name,
      handle: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    }))
    .filter((c) => !existingHandles.has(c.handle))

  if (collectionsToCreate.length) {
    await createCollectionsWorkflow(req.scope).run({
      input: { collections: collectionsToCreate },
    })
  }

  const { data: allCollections } = await query.graph({
    entity: "product_collection",
    fields: ["id", "handle", "title"],
  })
  const collectionByTitle = new Map(allCollections.map((c: any) => [c.title, c.id]))

  // 2. Products — skip any handle that already exists (idempotent / resumable).
  const { data: existingProducts } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
  })
  const existingProductHandles = new Set(existingProducts.map((p: any) => p.handle))

  const toCreate = ROWS.filter((r) => r.handle && !existingProductHandles.has(r.handle))

  const BATCH = 20
  let created = 0
  for (let i = 0; i < toCreate.length; i += BATCH) {
    const batch = toCreate.slice(i, i + BATCH)
    await createProductsWorkflow(req.scope).run({
      input: {
        products: batch.map((r) => ({
          title: r.title,
          handle: r.handle,
          status: "published" as const,
          collection_id: collectionByTitle.get(r.series),
          description: `${r.size} · Aluminum print in an aluminum float frame.`,
          images: [{ url: r.img }],
          thumbnail: r.img,
          sales_channels: [{ id: defaultChannel.id }],
          options: [{ title: "Size", values: [r.size] }],
          variants: [
            {
              title: r.size,
              sku: r.sku,
              manage_inventory: false,
              options: { Size: r.size },
              prices: [{ amount: r.price, currency_code: "usd" }],
            },
          ],
        })),
      },
    })
    created += batch.length
  }

  res.json({
    ok: true,
    collectionsCreated: collectionsToCreate.length,
    productsCreated: created,
    productsSkipped: ROWS.length - toCreate.length,
    totalRows: ROWS.length,
  })
}
