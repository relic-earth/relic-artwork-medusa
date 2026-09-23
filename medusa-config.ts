import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

// Stripe card payments for the relic.earth artwork store.
// Registered only when STRIPE_API_KEY is set, so a missing key never stops
// the server from booting. Provider id resolves to "pp_stripe_stripe";
// src/scripts/enable-stripe.ts attaches it to every region on start.
const paymentModules = process.env.STRIPE_API_KEY
  ? [
      {
        resolve: '@medusajs/medusa/payment',
        options: {
          providers: [
            {
              resolve: '@medusajs/medusa/payment-stripe',
              id: 'stripe',
              options: {
                apiKey: process.env.STRIPE_API_KEY,
                webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
                capture: true,
              },
            },
          ],
        },
      },
    ]
  : []

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    }
  },
  admin: {
    disable: true,
  },
  modules: paymentModules,
})
