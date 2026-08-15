import React from "react";

export default function FadedEmployeePortrait({ photoUrl, name }) {
  if (!photoUrl) return null;

  return (
    <img
      src={photoUrl}
      alt=""
      aria-hidden="true"
      className="pointer-events-none absolute -right-2 -top-1 z-0 h-[108%] w-[62%] object-cover object-top opacity-40 grayscale contrast-110 saturate-0 [mask-image:radial-gradient(ellipse_at_72%_30%,black_0%,black_34%,transparent_78%)] [-webkit-mask-image:radial-gradient(ellipse_at_72%_30%,black_0%,black_34%,transparent_78%)]"
      title={name}
    />
  );
}