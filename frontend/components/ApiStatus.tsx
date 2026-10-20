"use client";

import { useEffect, useState } from "react";
import { authenticatedFetch } from "@/utils/api";

export default function ApiStatus() {
  const [status, setStatus] = useState("checking...");

  useEffect(() => {
    authenticatedFetch("/health", { allowAnonymous: true })
      .then((response) => {
        if (response.ok) {
          setStatus("ok");
        } else {
          setStatus("error");
        }
      })
      .catch(() => {
        setStatus("error");
      });
  }, []);

  return <p>API: {status}</p>;
}