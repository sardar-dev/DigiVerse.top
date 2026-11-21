export const GTM_ID = "GTM-PJD2H8CX";

export const pageview = (url) => {
  if (typeof window !== "undefined" && window.dataLayer) {
    window.dataLayer.push({
      event: "page_view",
      page_path: url,
    });
  }
};

export const event = (eventName, data = {}) => {
  if (typeof window !== "undefined" && window.dataLayer) {
    window.dataLayer.push({
      event: eventName,
      ...data,
    });
  }
};

