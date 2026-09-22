import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "@/app/page";

describe("Home page", () => {
  it("renders the app name", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: "MoneyWrench" }),
    ).toBeInTheDocument();
  });
});
