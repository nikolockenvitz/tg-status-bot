const nodeFetch = require("node-fetch");

export async function fetch(method: string, url: string, data?: Object | string, options?: { headers?: Object; furtherOptions?: Object }) {
  const fetchOptions: any = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(options && options.headers ? options.headers : {}),
    },
    ...(options && options.furtherOptions ? options.furtherOptions : {}),
  };
  if (data && typeof data === "object") fetchOptions.body = JSON.stringify(data);
  if (data && typeof data === "string") fetchOptions.body = data;
  const response = await nodeFetch(url, fetchOptions);
  return await response.text();
}

export function objectToFormData(object) {
  let formData = "";
  for (const key in object) {
    if (formData) formData += "&";
    formData += `${encodeURIComponent(key)}=${encodeURIComponent(object[key])}`;
  }
  return formData;
}

export function formatDate(date: Date, formatStr: string): string {
  return formatStr
    .replace("YYYY", pad(date.getFullYear(), 4))
    .replace("MM", pad(date.getMonth() + 1, 2))
    .replace("DD", pad(date.getDate(), 2))
    .replace("HH", pad(date.getHours(), 2))
    .replace("mm", pad(date.getMinutes(), 2))
    .replace("ss", pad(date.getSeconds(), 2))
    .replace("WWW", ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()])
    .replace("WWWW", ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getDay()]);
}

export function pad(text: string | number, length: number, padChar = "0", padFront = true) {
  text = String(text);
  const padChars = padChar.repeat(length - text.length).substr(0, length - text.length);
  return padFront ? padChars + text : text + padChars;
}
