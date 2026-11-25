import { useTitle } from "../lib/hooks.js";
import { Button, Display, Glass } from "../ui/kit.jsx";

export function NotFound() {
  useTitle("Not found");
  return (
    <Glass pad="lg" class="notfound reveal">
      <p class="kicker">404</p>
      <Display pre="Lost" accent="in" post="the clouds" />
      <p class="lead">That page doesn't exist, but your plan is right where you left it.</p>
      <Button href="/app" icon="house">
        Back home
      </Button>
    </Glass>
  );
}
