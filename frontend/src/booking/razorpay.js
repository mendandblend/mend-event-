let scriptPromise = null;

export function loadRazorpayCheckout() {
  if (typeof window !== "undefined" && window.Razorpay) {
    return Promise.resolve(window.Razorpay);
  }
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]',
    );
    if (existing) {
      if (window.Razorpay) {
        resolve(window.Razorpay);
        return;
      }
      existing.addEventListener("load", () => resolve(window.Razorpay));
      existing.addEventListener("error", () => {
        existing.remove();
        scriptPromise = null;
        reject(new Error("Could not load Razorpay Checkout. Check your internet connection or ad blocker."));
      });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(window.Razorpay);
    script.onerror = () => {
      script.remove();
      scriptPromise = null;
      reject(new Error("Could not load Razorpay Checkout. Check your internet connection or ad blocker."));
    };
    document.body.appendChild(script);
  });

  return scriptPromise;
}
