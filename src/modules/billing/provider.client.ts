import { DodoPayments } from "dodopayments";
import { env } from "../../config/index.js";

const createProviderClient = async () => {
  const environment = env.NODE_ENV === "production" ? "live_mode" : "test_mode"

  console.log(`[env]: ${environment}`)


  const providerClient = new DodoPayments({
    bearerToken: env.PROVIDER_API_KEY,
    webhookKey: env.PROVIDER_WEBHOOK_KEY,
    environment: environment,
  });

  return providerClient
}

const providerClient = await createProviderClient()

export { providerClient }