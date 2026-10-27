import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { ProviderCredentials, logger } from '@nexus/core';

export class CredentialVault {
  private readonly algorithm = 'aes-256-gcm';

  /**
   * Derives a machine- and user-bound 256-bit key specific to this OS user and installation.
   */
  private getMasterKey(): Buffer {
    const user = os.userInfo().username || 'default_user';
    const homedir = os.homedir() || '';
    const platform = process.platform;
    const entropy = `nexus_v2_vault_${user}_${homedir}_${platform}`;
    return crypto.scryptSync(entropy, 'nexus_salt_v2_storage_vault', 32);
  }

  /**
   * Encrypts plaintext credentials object to a secure envelope.
   */
  encrypt(creds: ProviderCredentials): { data: string; iv: string; tag: string; format: string } {
    const key = this.getMasterKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);

    const plaintext = JSON.stringify(creds);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');

    return {
      format: 'nexus_vault_v2_aes256gcm',
      data: encrypted,
      iv: iv.toString('hex'),
      tag,
    };
  }

  /**
   * Decrypts an encrypted envelope back to ProviderCredentials.
   */
  decrypt(envelope: { data: string; iv: string; tag: string }): ProviderCredentials {
    try {
      const key = this.getMasterKey();
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        key,
        Buffer.from(envelope.iv, 'hex')
      );
      decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));

      let decrypted = decipher.update(envelope.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return JSON.parse(decrypted) as ProviderCredentials;
    } catch (err: any) {
      logger.error('CredentialVault: Failed to decrypt credentials envelope:', err);
      return {};
    }
  }

  /**
   * Loads credentials from disk, handling automatic migration from plaintext credentials.json
   * to encrypted credentials.enc.
   */
  loadFromDisk(dataDir: string): ProviderCredentials {
    const encFile = path.join(dataDir, 'credentials.enc');
    const jsonFile = path.join(dataDir, 'credentials.json');

    // 1. If encrypted vault file exists, read and decrypt it
    if (fs.existsSync(encFile)) {
      try {
        const raw = fs.readFileSync(encFile, 'utf8');
        const envelope = JSON.parse(raw);
        return this.decrypt(envelope);
      } catch (err) {
        logger.error('CredentialVault: Error loading credentials.enc:', err);
      }
    }

    // 2. Migration from legacy plaintext credentials.json
    if (fs.existsSync(jsonFile)) {
      try {
        const raw = fs.readFileSync(jsonFile, 'utf8');
        const plaintextCreds = JSON.parse(raw) as ProviderCredentials;

        logger.info('CredentialVault: Migrating plaintext credentials.json to encrypted vault...');
        this.saveToDisk(dataDir, plaintextCreds);

        // Safely backup and remove plaintext file
        fs.writeFileSync(jsonFile + '.bak', raw, { mode: 0o600 });
        fs.unlinkSync(jsonFile);
        logger.info('CredentialVault: Plaintext credentials.json successfully encrypted and removed.');

        return plaintextCreds;
      } catch (err) {
        logger.error('CredentialVault: Error during plaintext credentials migration:', err);
      }
    }

    return {};
  }

  /**
   * Saves credentials encrypted to credentials.enc.
   */
  saveToDisk(dataDir: string, creds: ProviderCredentials): void {
    const encFile = path.join(dataDir, 'credentials.enc');
    const envelope = this.encrypt(creds);

    const tempPath = `${encFile}.tmp.${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(envelope, null, 2), { mode: 0o600 });
    fs.renameSync(tempPath, encFile);
  }

  /**
   * Returns security metadata about the credential vault.
   */
  getVaultStatus(dataDir: string): { isEncrypted: boolean; algorithm: string; fileExists: boolean } {
    const encFile = path.join(dataDir, 'credentials.enc');
    const jsonFile = path.join(dataDir, 'credentials.json');

    if (fs.existsSync(encFile) && !fs.existsSync(jsonFile)) {
      return {
        isEncrypted: true,
        algorithm: 'AES-256-GCM (Machine & User Bound Key)',
        fileExists: true,
      };
    }
    return {
      isEncrypted: false,
      algorithm: 'None (Plaintext)',
      fileExists: fs.existsSync(jsonFile),
    };
  }
}

export const globalCredentialVault = new CredentialVault();
