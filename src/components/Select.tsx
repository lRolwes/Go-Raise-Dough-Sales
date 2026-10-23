/** A labeled select whose first option means "any" (empty value). */
export default function Select({
  label,
  name,
  value,
  options,
  any = "Any",
  className,
}: {
  label: string;
  name: string;
  value?: string | null;
  options: readonly string[] | { value: string; label: string }[];
  any?: string | null;
  className?: string;
}) {
  const opts = (options as (string | { value: string; label: string })[]).map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );
  return (
    <label className={className}>
      {label}
      <select id={`f-${name}`} name={name} defaultValue={value ?? ""}>
        {any !== null && <option value="">{any}</option>}
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
