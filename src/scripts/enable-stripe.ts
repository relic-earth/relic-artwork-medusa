import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows"

const STRIPE_PROVIDER_ID = "pp_stripe_stripe"

/**
 * Idempotently attaches the Stripe payment provider to every region so the
 * relic.earth artwork store can take card payments. Runs on each start
 * (see package.json "start"); a region that already has Stripe is skipped.
 * Does nothing when STRIPE_API_KEY is not set, because the provider is only
 * registered in medusa-config.ts when that key exists.
 */
export default async function enableStripe({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  if (!process.env.STRIPE_API_KEY) {
    logger.info("enable-stripe: STRIPE_API_KEY is not set, skipping.")
    return
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "name", "payment_providers.id"],
  })

  for (const region of regions) {
    const current = (region.payment_providers ?? [])
      .map((p: { id: string } | null) => p?.id)
      .filter(Boolean) as string[]

    if (current.includes(STRIPE_PROVIDER_ID)) {
      logger.info(`enable-stripe: region "${region.name}" already accepts Stripe.`)
      continue
    }

    await updateRegionsWorkflow(container).run({
      input: {
        selector: { id: region.id },
        update: { payment_providers: [...current, STRIPE_PROVIDER_ID] },
      },
    })
    logger.info(`enable-stripe: region "${region.name}" now accepts Stripe.`)
  }
}
