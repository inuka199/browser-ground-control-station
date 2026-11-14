/**
 * components/views/PlaceholderView.jsx
 * Reusable "Coming in Phase N" view used by all stub module routes.
 * Provides a clear, honest status rather than an empty page.
 */
import React from 'react';

export default function PlaceholderView({ title, icon, phase, description, features = [] }) {
  return (
    <div className="placeholder-view">
      <div className="placeholder-view__card">
        <div className="placeholder-view__icon">{icon}</div>
        <h2 className="placeholder-view__title">{title}</h2>
        <div className="placeholder-view__badge">Planned — Phase {phase}</div>
        <p className="placeholder-view__desc">{description}</p>
        {features.length > 0 && (
          <ul className="placeholder-view__features">
            {features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
        <p className="placeholder-view__note">
          Implementation will begin after the Phase {phase - 1} foundation is verified and approved.
        </p>
      </div>
    </div>
  );
}
