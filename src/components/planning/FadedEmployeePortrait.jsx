import React from "react";

export default function FadedEmployeePortrait({ photoUrl, name }) {
  if (!photoUrl) return null;

  return (
    <img
      src={photoUrl}
      alt=""
      aria-hidden="true"
      className="pointer-events-none absolute right-0 top-0 z-0 h-[58%] w-[42%] object-cover object-top opacity-60 [mask-image:radial-gradient(ellipse_at_76%_24%,black_0%,black_56%,transparent_94%)] [-webkit-mask-image:radial-gradient(ellipse_at_76%_24%,black_0%,black_56%,transparent_94%)]"
      title={name}
    />
  );
}