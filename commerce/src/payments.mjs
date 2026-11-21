/** Server orchestration; authenticated subject is supplied by transport, never a JSON user-id. */
export function createPaymentService(store,paypal) {
  const expected = intent => ({intentId:intent.id,merchantId:intent.merchantId,depositCents:intent.depositCents,...(intent.orderId?{orderId:intent.orderId}:{})});
  async function execute(subject,tenant,intentId,kind,options) {
    // Check actual buyer approval using PayPal, not a browser success flag.
    if (kind==='capture') {
      const intent=store.readIntent(subject,tenant,intentId);
      const order=await paypal.getOrder(expected(intent));
      if (order.capture) return store.reconcileOrder(subject,tenant,intentId,order);
      if (order.status!=='APPROVED') return store.reconcileOrder(subject,tenant,intentId,order);
    }
    const claim=store.claimOperation(subject,tenant,intentId,kind,options);
    try {
      const input={...expected(claim.intent),operationId:claim.operationId};
      const result=await (kind==='create'?paypal.createOrder(input):paypal.captureOrder(input));
      return store.completeOperation(claim.operationId,claim.claim,result);
    } catch (error) {
      store.operationUncertain(claim.operationId,claim.claim);throw error;
    }
  }
  return Object.freeze({
    createOrder:(subject,tenant,intentId,options)=>execute(subject,tenant,intentId,'create',options),
    captureOrder:(subject,tenant,intentId,options)=>execute(subject,tenant,intentId,'capture',options),
    async reconcile(subject,tenant,intentId) {
      const intent=store.readIntent(subject,tenant,intentId);
      return store.reconcileOrder(subject,tenant,intentId,await paypal.getOrder(expected(intent)));
    },
    async webhook(rawBody,headers) {
      const verified=await paypal.verifyWebhook({rawBody,headers});
      return store.acceptVerifiedWebhook(rawBody,verified);
    },
  });
}
