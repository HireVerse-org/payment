import { injectable } from "inversify";
import Stripe from "stripe";
import { IPaymentAdapter } from "./interface/payment.adapter.interface";
import { checkEnvVariables } from "@hireverse/service-common/dist/utils";
import { InternalError } from "@hireverse/service-common/dist/app.errors";
import { logger } from "../utils/logger";
import { CreateCustomerDTO, CreatePaymentLinkDTO, CreatePlanDTO, SubscribeToPlanDTO } from "./dto/adapter.dto";
import { SubscriptionPlan } from "../../modules/subscription/seeker/models/seeker.subscription.entity";
import { CompanySubscriptionPlans } from "../../modules/subscription/company/models/company.subscription.entity";

checkEnvVariables("STRIPE_API_KEY");

const stripe = new Stripe(process.env.STRIPE_API_KEY!);

export const STRIPE_SEEKER_SUBSCRIPTION_IDS = {
    [SubscriptionPlan.FREE]: "price_1QhVWuRFZZ0zOK4co7hJQF9o",
    [SubscriptionPlan.BASIC]: "price_1QhUgURFZZ0zOK4cX57dKXCn",
    [SubscriptionPlan.PREMIUM]: "price_1QhVJwRFZZ0zOK4cqrzCNcbd",
};

export const STRIPE_COMPANY_SUBSCRIPTION_IDS = {
    [CompanySubscriptionPlans.FREE]: "price_1QhVWuRFZZ0zOK4co7hJQF9o",
    [CompanySubscriptionPlans.BASIC]: "price_1QiC7NRFZZ0zOK4csrYjI14d",
    [CompanySubscriptionPlans.PREMIUM]: "price_1QiC8RRFZZ0zOK4cPH5R1HXQ",
};

@injectable()
export class StripePaymentAdapter implements IPaymentAdapter {
    async createCustomer(data: CreateCustomerDTO): Promise<string> {
        const { email, name, metadata } = data;
        try {
            const customer = await stripe.customers.create({ email, name, metadata });
            return customer.id;
        } catch (error) {
            logger.error("Failed to create Stripe customer:", error);
            throw new InternalError("Failed to create customer");
        }
    }

    async subscribeToPlan(data: SubscribeToPlanDTO): Promise<string> {
        const { customerId, planId, metadata } = data;
        try {
            const subscription = await stripe.subscriptions.create({
                customer: customerId,
                items: [{ price: planId }],
                metadata,
            });
            return subscription.id;
        } catch (error) {
            logger.error("Failed to subscribe to plan:", error);
            throw new InternalError("Failed to subscribe customer to plan");
        }
    }

    async createPlan(data: CreatePlanDTO): Promise<string> {
        const { name, description, amount, currency, interval, metadata } = data;
        try {
            const product = await stripe.products.create({ name, description, metadata });
            const price = await stripe.prices.create({
                product: product.id,
                unit_amount: amount,
                currency,
                recurring: { interval },
                metadata,
            });
            return price.id;
        } catch (error) {
            logger.error("Failed to create plan:", error);
            throw new InternalError("Failed to create plan");
        }
    }

    async createPaymentLink(data: CreatePaymentLinkDTO): Promise<string> {
        const { customerId, priceId, quantity = 1, metadata, successUrl, cancelUrl } = data;
        try {
            const session = await stripe.checkout.sessions.create({
                line_items: [
                    {
                        price: priceId,
                        quantity,
                    },
                ],
                mode: "subscription",
                metadata,
                customer: customerId,
                success_url: successUrl,
                cancel_url: cancelUrl,
            });
            return session.url ? session.url : "";
        } catch (error) {
            logger.error("Failed to create payment link:", error);
            throw new InternalError("Failed to create payment link");
        }
    }

    async getPlanDetails(planId: string): Promise<{ amount: number; currency: string; }> {
        try {
            const price = await stripe.prices.retrieve(planId);

            const amount = price.unit_amount ? price.unit_amount / 100 : 0; 
            const currency = price.currency;

            return { amount, currency };
        } catch (error) {
            logger.error("Failed to retrieve plan details:", error);
            throw new InternalError("Failed to retrieve plan details");
        }
    }
}
