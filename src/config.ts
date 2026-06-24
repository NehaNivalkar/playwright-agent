export const config = {
  baseUrl:  "https://the-internet.herokuapp.com",
  username: "tomsmith",
  password: "SuperSecretPassword!",
  headless: false,
  reportsDir: "reports",
  gchatWebhook: process.env.GCHAT_WEBHOOK ?? "",
};
