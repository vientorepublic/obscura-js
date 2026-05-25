// sample.jsx — Obscura.js JSX obfuscation demo

const API_URL = "https://api.example.com/data";
const APP_NAME = "MyApp";

function Button({ label, variant, onClick }) {
  const cls = variant === "primary" ? "btn btn-primary" : "btn btn-secondary";
  return (
    <button className={cls} aria-label={label} onClick={onClick}>
      {label}
    </button>
  );
}

function UserCard({ name, role, avatarUrl }) {
  const title = `${APP_NAME} — ${role}`;
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("");
  return (
    <div className="card" data-testid="user-card">
      <img src={avatarUrl} alt={`Avatar of ${name}`} className="avatar" />
      <div className="card-body">
        <h2 className="card-title">{title}</h2>
        <p className="card-text">
          {"Welcome back, "}
          <strong>{name}</strong>
          {` (${initials})`}
        </p>
        <Button label="View Profile" variant="primary" onClick={() => {}} />
        <Button label="Logout" variant="secondary" onClick={() => {}} />
      </div>
    </div>
  );
}

function fetchUser(id) {
  const url = `${API_URL}/users/${id}`;
  return fetch(url).then((res) => res.json());
}

export { UserCard, fetchUser };
