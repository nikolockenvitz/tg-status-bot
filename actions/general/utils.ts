const nodeFetch = require("node-fetch");

export async function fetch(method: string, url: string, data?: Object) {
  const options: any = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };
  if (data) options.body = JSON.stringify(data);
  const response = await nodeFetch(url, options);
  return await response.text();
}
