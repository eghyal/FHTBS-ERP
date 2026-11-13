import React, { useState, useCallback, useEffect } from "react";
import { useInterval } from "@/hooks/useInterval";

export const LiveClock = React.memo(function LiveClock() {
  const [time, setTime] = useState("");

  const updateTime = useCallback(() => {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    };
    const formatter = new Intl.DateTimeFormat("en-GB", options);
    const parts = formatter.formatToParts(now);
    const dateObj: Record<string, string> = {};
    parts.forEach(({ type, value }) => {
      dateObj[type] = value;
    });
    setTime(
      `${dateObj.year}-${dateObj.month}-${dateObj.day} ${dateObj.hour}:${dateObj.minute}:${dateObj.second} WIB`,
    );
  }, []);

  useEffect(() => {
    updateTime();
  }, [updateTime]);

  useInterval(updateTime, 1000);

  return (
    <span className="text-[10px] text-stone-300 font-mono tabular-nums tracking-tighter">
      {time}
    </span>
  );
});

export const HeaderClock = React.memo(function HeaderClock() {
  const [time, setTime] = useState("");

  const updateTime = useCallback(() => {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    };
    setTime(new Intl.DateTimeFormat("en-GB", options).format(now));
  }, []);

  useEffect(() => {
    updateTime();
  }, [updateTime]);

  useInterval(updateTime, 1000);

  return (
    <span className="font-mono tabular-nums text-stone-600">
      {time || "--:--:--"}
    </span>
  );
});
