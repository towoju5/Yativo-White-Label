import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchBranding } from "@/theme/branding";

/**
 * Injects the admin-pasted live-chat embed snippet (tawk.to-style) into the page. A snippet's
 * <script> tags never execute via dangerouslySetInnerHTML — the DOM only runs a <script> element
 * it actually created — so this parses the snippet and re-creates each node imperatively.
 */
export function LiveChatWidget() {
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });
  const code = branding?.liveChatEnabled ? branding.liveChatCode : null;

  useEffect(() => {
    if (!code) return;

    const container = document.createElement("div");
    container.setAttribute("data-livechat-widget", "true");
    const template = document.createElement("template");
    template.innerHTML = code;

    for (const node of Array.from(template.content.childNodes)) {
      if (node.nodeName === "SCRIPT") {
        const original = node as HTMLScriptElement;
        const script = document.createElement("script");
        for (const attr of Array.from(original.attributes)) script.setAttribute(attr.name, attr.value);
        script.text = original.text;
        container.appendChild(script);
      } else {
        container.appendChild(node.cloneNode(true));
      }
    }

    document.body.appendChild(container);
    return () => {
      container.remove();
    };
  }, [code]);

  return null;
}
