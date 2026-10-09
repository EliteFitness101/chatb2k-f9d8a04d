-- Cover the hot revenue, fulfillment, sourcing and orchestration foreign-key joins.
CREATE INDEX IF NOT EXISTS idx_buffer_publications_content_id ON public.buffer_publications(content_id);
CREATE INDEX IF NOT EXISTS idx_chatb2k_automation_tasks_user_id ON public.chatb2k_automation_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_commercial_offer_id ON public.payments(commercial_offer_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON public.profiles(referred_by);
CREATE INDEX IF NOT EXISTS idx_resofit_fulfillment_items_order_id ON public.resofit_fulfillment_items(fulfillment_order_id);
CREATE INDEX IF NOT EXISTS idx_resofit_fulfillment_items_product_id ON public.resofit_fulfillment_items(product_id);
CREATE INDEX IF NOT EXISTS idx_resofit_fulfillment_orders_customer_id ON public.resofit_fulfillment_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_resofit_sourcing_requests_customer_id ON public.resofit_sourcing_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_resofit_sourcing_requests_generated_product_id ON public.resofit_sourcing_requests(generated_product_id);
CREATE INDEX IF NOT EXISTS idx_resofit_sourcing_requests_payment_id ON public.resofit_sourcing_requests(payment_id);
CREATE INDEX IF NOT EXISTS idx_resofit_sourcing_requests_supplier_product_id ON public.resofit_sourcing_requests(selected_supplier_product_id);
