import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container section not-found">
      <p className="eyebrow">404</p>
      <h1>This page does not exist.</h1>
      <p className="lead">The address may be mistyped, or the page moved. Launch pages use the form /launch/?id=0.</p>
      <div className="row">
        <Link className="btn btn-primary" href="/">
          Go to the home page
        </Link>
        <Link className="btn btn-secondary" href="/#launches">
          See launches
        </Link>
      </div>
    </div>
  );
}
