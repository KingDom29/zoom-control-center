/**
 * Branding Service
 * Dynamisches Branding für alle Kommunikation
 */

export const BRANDS = {
  maklerplan: {
    id: 'maklerplan',
    name: 'Maklerplan GmbH',
    legalName: 'Maklerplan Pro GmbH',
    slogan: 'Die Software für Immobilienprofis',
    
    // E-Mail
    fromEmail: 'support@maklerplan.com',
    fromName: 'Maklerplan',
    replyTo: 'support@maklerplan.com',
    
    // Farben
    colors: {
      primary: '#667eea',
      secondary: '#764ba2',
      accent: '#f093fb',
      success: '#22c55e',
      warning: '#f59e0b',
      danger: '#ef4444'
    },
    
    // URLs
    website: 'https://www.maklerplan.com',
    bookingUrl: 'https://us06web.zoom.us/meeting/register/...',
    
    // Kontakt
    phone: '+49 30 219 25007',
    phoneSwiss: '+41 41 510 61 00',
    
    // Adressen
    addresses: {
      germany: {
        company: 'Maklerplan Pro GmbH',
        street: 'Französische Str. 20',
        city: '10117 Berlin',
        country: 'Deutschland',
        register: 'HRB 264573 B, AG Berlin'
      },
      switzerland: {
        company: 'Maklerplan GmbH',
        street: 'Grafenauweg 8',
        city: '6300 Zug',
        country: 'Schweiz',
        register: 'CHE-138.210.925'
      }
    },
    
    // Geschäftsführer
    ceo: 'Dominik Eisenhardt',
    
    // E-Mail Footer
    getFooter() {
      return `
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 11px; color: #666;">
          <table style="width: 100%;">
            <tr>
              <td style="vertical-align: top; padding-right: 15px;">
                <p style="margin: 0 0 3px;"><strong>${this.addresses.germany.company}</strong></p>
                <p style="margin: 0; font-size: 10px;">${this.addresses.germany.street}, ${this.addresses.germany.city}<br>
                ${this.phone} · ${this.addresses.germany.register}</p>
              </td>
              <td style="vertical-align: top;">
                <p style="margin: 0 0 3px;"><strong>${this.addresses.switzerland.company}</strong></p>
                <p style="margin: 0; font-size: 10px;">${this.addresses.switzerland.street}, ${this.addresses.switzerland.city}<br>
                ${this.phoneSwiss} · ${this.addresses.switzerland.register}</p>
              </td>
            </tr>
          </table>
          <p style="margin: 12px 0 0; font-size: 10px;">
            Geschäftsführer: ${this.ceo} · 
            <a href="${this.website}" style="color: ${this.colors.primary};">${this.website.replace('https://', '')}</a>
          </p>
        </div>
      `;
    }
  },
  
  leadquelle: {
    id: 'leadquelle',
    name: 'Leadquelle Deutschland',
    legalName: 'Leadquelle Deutschland',
    slogan: 'Mehr Kunden. Ganz sicher.',
    
    // E-Mail
    fromEmail: 'de@leadquelle.ai',
    fromName: 'Leadquelle',
    replyTo: 'de@leadquelle.ai',
    
    // Farben
    colors: {
      primary: '#10b981',
      secondary: '#059669',
      accent: '#34d399',
      success: '#22c55e',
      warning: '#f59e0b',
      danger: '#ef4444'
    },
    
    // URLs
    website: 'https://leadquelle.ai',
    bookingUrl: 'https://us06web.zoom.us/meeting/register/X7XllnKaSKSJ9ACdf_Wvvg',
    
    // Kontakt
    phone: '+49 30 219 25007',
    
    // Adressen
    addresses: {
      germany: {
        company: 'Leadquelle Deutschland',
        street: 'Friedrichstraße 171',
        city: '10117 Berlin',
        country: 'Deutschland',
        register: ''
      }
    },
    
    // Geschäftsführer
    ceo: 'Dominik Eisenhardt',
    
    // E-Mail Footer
    getFooter() {
      return `
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 11px; color: #666;">
          <p style="margin: 0 0 3px;"><strong>${this.name}</strong></p>
          <p style="margin: 0; font-size: 10px;">
            ${this.addresses.germany.street}, ${this.addresses.germany.city}<br>
            ${this.phone} · <a href="mailto:${this.fromEmail}" style="color: ${this.colors.primary};">${this.fromEmail}</a>
          </p>
          <p style="margin: 10px 0 0; font-size: 10px;">
            <a href="${this.website}" style="color: ${this.colors.primary};">${this.website.replace('https://', '')}</a>
          </p>
        </div>
      `;
    }
  }
};

class BrandingService {
  
  getBrand(brandId) {
    return BRANDS[brandId] || BRANDS.maklerplan;
  }
  
  getAllBrands() {
    return Object.values(BRANDS);
  }
  
  getEmailConfig(brandId) {
    const brand = this.getBrand(brandId);
    return {
      from: brand.fromEmail,
      fromName: brand.fromName,
      replyTo: brand.replyTo,
      footer: brand.getFooter()
    };
  }
  
  getColors(brandId) {
    return this.getBrand(brandId).colors;
  }
  
  // Styled Button generieren
  getButton(brandId, text, url, style = 'primary') {
    const brand = this.getBrand(brandId);
    const color = brand.colors[style] || brand.colors.primary;
    
    return `
      <a href="${url}" style="display: inline-block; background: ${color}; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
        ${text}
      </a>
    `;
  }
  
  // E-Mail Wrapper
  wrapEmail(brandId, content) {
    const brand = this.getBrand(brandId);
    
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <div style="padding: 20px;">
          ${content}
        </div>
        ${brand.getFooter()}
        <div style="padding: 15px; text-align: center; font-size: 10px; color: #999;">
          <a href="{{optout_url}}" style="color: #999;">Abmelden</a> · 
          <a href="${brand.website}/datenschutz" style="color: #999;">Datenschutz</a> · 
          <a href="${brand.website}/impressum" style="color: #999;">Impressum</a>
        </div>
      </div>
    `;
  }
}

export const brandingService = new BrandingService();
