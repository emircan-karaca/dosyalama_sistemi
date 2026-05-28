import { createTheme, MantineColorsTuple } from "@mantine/core";

const brandColor: MantineColorsTuple = [
  "#f0f4ff",
  "#dce4ff",
  "#b4c6ff",
  "#8aa5ff",
  "#6688ff",
  "#4d73ff",
  "#3d66ff",
  "#2d55e6",
  "#234bcd",
  "#1640b3",
];

export const theme = createTheme({
  primaryColor: "brand",
  colors: { brand: brandColor },
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  headings: {
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontWeight: "700",
  },
  defaultRadius: "md",
  components: {
    Button: { defaultProps: { radius: "md" }, styles: { root: { fontWeight: 600 } } },
    Paper: { defaultProps: { radius: "lg", shadow: "sm" } },
    TextInput: { defaultProps: { radius: "md" } },
    PasswordInput: { defaultProps: { radius: "md" } },
  },
});
