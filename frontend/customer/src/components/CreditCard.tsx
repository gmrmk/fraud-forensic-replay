import { maskBrand } from "../lib/derive";

interface Props {
  network: string;
  bin: string;
  lastFour: string;
  holder: string;
  product: string;
}

export function CreditCard({ network, bin, lastFour, holder, product }: Props) {
  return (
    <div
      className="relative rounded-2xl text-white flex flex-col justify-between overflow-hidden"
      style={{
        height: 178,
        padding: 18,
        background: "linear-gradient(135deg,#312e81,#4338ca 55%,#6d28d9)",
        boxShadow: "0 14px 30px rgba(67,56,202,.34)",
      }}
    >
      {/* Decorative circle overlay top-right */}
      <div
        className="absolute pointer-events-none"
        style={{
          right: -40,
          top: -40,
          width: 170,
          height: 170,
          borderRadius: "50%",
          background: "rgba(255,255,255,.07)",
        }}
      />

      {/* Row 1: product label + chip */}
      <div className="flex justify-between items-start relative z-10">
        <span
          className="font-bold uppercase tracking-widest"
          style={{ fontSize: 11, letterSpacing: "0.12em", opacity: 0.92 }}
        >
          {maskBrand(product)}
        </span>
        {/* EMV chip */}
        <div
          className="rounded-[5px]"
          style={{
            width: 30,
            height: 22,
            background: "linear-gradient(135deg,#e6c879,#c9a84e)",
          }}
        />
      </div>

      {/* Row 2: masked PAN */}
      <div
        className="font-mono relative z-10"
        style={{ fontSize: 15, letterSpacing: "0.12em" }}
      >
        {bin.slice(0, 4)} ···· ···· {lastFour}
      </div>

      {/* Row 3: holder + network */}
      <div className="flex justify-between items-end relative z-10">
        <div>
          <div style={{ fontSize: 12, letterSpacing: "0.04em", opacity: 0.95 }}>
            {holder.toUpperCase()}
          </div>
          <div style={{ fontSize: 10, letterSpacing: "0.06em", opacity: 0.7 }}>
            EXP 08/27
          </div>
        </div>
        <span className="font-bold italic" style={{ fontSize: 18, letterSpacing: "-0.02em" }}>
          {maskBrand(network.toUpperCase())}
        </span>
      </div>
    </div>
  );
}
