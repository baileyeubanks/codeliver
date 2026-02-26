import type { PropsWithChildren, AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

type Variant = "default" | "light" | "ghost";
type Size = "default" | "small";

interface ButtonBaseProps {
  variant?: Variant;
  size?: Size;
  className?: string;
}

function cls(variant: Variant, size: Size, extra?: string) {
  const parts = ["button"];
  if (variant !== "default") parts.push(variant);
  if (size === "small") parts.push("small");
  if (extra) parts.push(extra);
  return parts.join(" ");
}

type LinkProps = ButtonBaseProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };
type NativeProps = ButtonBaseProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: never };

export function Button(props: PropsWithChildren<LinkProps | NativeProps>) {
  const { variant = "default", size = "default", className, children, ...rest } = props;
  const cn = cls(variant, size, className);

  if ("href" in rest && rest.href) {
    return (
      <a className={cn} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </a>
    );
  }

  return (
    <button className={cn} type="button" {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}
