import React from "react";

export default function FadedEmployeePortrait({ photoUrl, name }) {
  if (!photoUrl) return null;

  return (
    <img
      src={photoUrl}
      alt=""
      aria-hidden="true"
      className="pointer-events-none absolute right-[1%] top-[5%] z-0 h-[60%] w-[36%] object-cover object-top opacity-35 [mask-image:radial-gradient(ellipse_at_78%_20%,black_0%,black_42%,transparent_88%)] [-webkit-mask-image:radial-gradient(ellipse_at_78%_20%,black_0%,black_42%,transparent_88%)]"
      title={name}
    />
  );
}