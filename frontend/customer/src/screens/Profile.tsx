import { useData } from "../store/data";
import { maskBrand } from "../lib/derive";
import { User, Mail, MapPin, Phone, Shield } from "lucide-react";

export function Profile() {
  const { account } = useData();
  const name = account?.customer.name ?? "Marcus Chen";

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-ink font-bold" style={{ fontSize: 16 }}>Profile</h2>
      </div>

      {/* Avatar + name hero */}
      <div className="bg-panel border border-line rounded-[14px] mb-4 overflow-hidden">
        <div
          className="flex items-center gap-4 border-b border-line"
          style={{ padding: "20px 20px" }}
        >
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold flex-none"
            style={{ fontSize: 22, background: "linear-gradient(135deg,#0ea5e9,#4338ca)" }}
          >
            {name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="text-ink font-bold" style={{ fontSize: 18 }}>{name}</div>
            <div className="text-muted mt-0.5" style={{ fontSize: 12 }}>Signature Cardholder since 2019</div>
          </div>
        </div>

        {/* Contact fields */}
        {[
          { icon: Mail,   label: "Email",   value: "marcus.chen@tealmoor.example" },
          { icon: Phone,  label: "Phone",   value: "+1 (713) 555-0142" },
          { icon: MapPin, label: "Address", value: "Memorial Dr, Houston, TX 77007" },
        ].map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="flex items-center gap-3 border-b border-line last:border-b-0"
            style={{ padding: "13px 20px" }}
          >
            <Icon size={16} className="text-muted flex-none" />
            <div>
              <div className="text-faint uppercase" style={{ fontSize: 10, letterSpacing: "0.07em" }}>{label}</div>
              <div className="text-ink mt-0.5" style={{ fontSize: 13 }}>{value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Account info */}
      <div className="bg-panel border border-line rounded-[14px] overflow-hidden mb-4">
        <div
          className="text-faint uppercase border-b border-line"
          style={{ fontSize: 10.5, letterSpacing: "0.07em", padding: "9px 16px" }}
        >
          Account details
        </div>
        {[
          { label: "Account type",   value: account?.account.type ?? "Credit" },
          { label: "Account number", value: `····${account?.account.account_number_last4 ?? "4729"}` },
          { label: "Card network",   value: maskBrand(account?.card.network ?? "Visa") },
          { label: "Credit limit",   value: account ? `$${account.credit_limit.toLocaleString()}` : "$15,000" },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="flex items-center justify-between border-b border-line last:border-b-0"
            style={{ padding: "11px 16px" }}
          >
            <span className="text-muted" style={{ fontSize: 13 }}>{label}</span>
            <span className="text-ink font-medium tnum" style={{ fontSize: 13 }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Security */}
      <div className="bg-panel border border-line rounded-[14px] overflow-hidden">
        <div
          className="text-faint uppercase border-b border-line"
          style={{ fontSize: 10.5, letterSpacing: "0.07em", padding: "9px 16px" }}
        >
          Security
        </div>
        <div
          className="flex items-center gap-3 border-b border-line"
          style={{ padding: "13px 16px" }}
        >
          <div className="w-9 h-9 rounded-[10px] bg-bg flex items-center justify-center flex-none">
            <Shield size={16} className="text-indigo" />
          </div>
          <div className="flex-1">
            <div className="text-ink" style={{ fontSize: 13 }}>Two-factor authentication</div>
            <div className="text-muted mt-0.5" style={{ fontSize: 11.5 }}>SMS to ···0142</div>
          </div>
          <span className="text-[11px] font-semibold text-[#15803d]">Active</span>
        </div>
        <div className="flex items-center gap-3" style={{ padding: "13px 16px" }}>
          <div className="w-9 h-9 rounded-[10px] bg-bg flex items-center justify-center flex-none">
            <User size={16} className="text-muted" />
          </div>
          <div className="flex-1">
            <div className="text-ink" style={{ fontSize: 13 }}>Password</div>
            <div className="text-muted mt-0.5" style={{ fontSize: 11.5 }}>Last changed 3 months ago</div>
          </div>
          <button type="button" className="text-indigo font-semibold" style={{ fontSize: 12 }}>
            Change
          </button>
        </div>
      </div>
    </div>
  );
}
