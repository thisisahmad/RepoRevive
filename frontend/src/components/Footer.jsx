import Logo from './ui/Logo'

const footerLinks = {
  Product: ['Features', 'Pricing', 'Changelog', 'Docs'],
  Company: ['About', 'Blog', 'Careers', 'Contact'],
  Legal: ['Privacy', 'Terms', 'Security'],
}

export default function Footer() {
  return (
    <footer className="border-t border-border-subtle py-16">
      <div className="section-container-wide">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <a href="#" className="flex items-center gap-2">
              <Logo />
            </a>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              AI-powered tool that clones broken GitHub repos, fixes deprecated
              dependencies, and makes them run again.
            </p>
          </div>

          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="font-display text-sm font-semibold">{category}</h4>
              <ul className="mt-4 space-y-3">
                {links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-muted transition-colors duration-200 hover:text-foreground"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-border-subtle pt-8 sm:flex-row">
          <p className="text-xs text-muted-dark">
            &copy; {new Date().getFullYear()} RepoRevive. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            {['GitHub', 'Twitter', 'Discord'].map((social) => (
              <a
                key={social}
                href="#"
                className="text-xs text-muted-dark transition-colors duration-200 hover:text-accent"
              >
                {social}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
