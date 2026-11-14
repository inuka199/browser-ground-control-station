import React from 'react';
import { Link } from 'react-router-dom';
import PageHeader from './PageHeader.jsx';
export default function NotFoundView() { return <section className="workspace-page"><PageHeader title="Page not found">This address does not match a page in Nexus GCS.</PageHeader><Link className="workspace-button" to="/">Go to dashboard</Link></section>; }
