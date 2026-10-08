"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/utils/api";

export default function ApiStatus() {
  const [status, setStatus] = useState("checking...");

  useEffect(() => {
    fetch(`${API_BASE_URL}/health`)
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