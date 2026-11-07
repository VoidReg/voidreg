//! Signed, short-lived tokens for the contact form.
//!
//! The web app asks the API for a token when it renders the form. A token proves the form was
//! served recently and was open for at least a few seconds, which a script that posts directly
//! cannot show. Tokens carry no personal data and are checked with HMAC-SHA256.
use sha2::{Digest, Sha256};

use crate::util::{constant_time_eq, random_token};

/// A message cannot arrive sooner than this after the form was issued.
pub const MIN_AGE_SECS: i64 = 3;
/// A form older than this must be reloaded.
pub const MAX_AGE_SECS: i64 = 2 * 60 * 60;

#[derive(Debug, PartialEq, Eq)]
pub enum TokenProblem {
    Malformed,
    BadSignature,
    TooFresh,
    Expired,
}

pub fn hmac_sha256(key: &[u8], message: &[u8]) -> Vec<u8> {
    const BLOCK: usize = 64;
    let mut padded = [0u8; BLOCK];
    if key.len() > BLOCK {
        padded[..32].copy_from_slice(Sha256::digest(key).as_slice());
    } else {
        padded[..key.len()].copy_from_slice(key);
    }
    let mut inner = Sha256::new();
    inner.update(padded.map(|byte| byte ^ 0x36));
    inner.update(message);
    let mut outer = Sha256::new();
    outer.update(padded.map(|byte| byte ^ 0x5c));
    outer.update(inner.finalize());
    outer.finalize().to_vec()
}

fn sign(secret: &str, payload: &str) -> String {
    hex::encode(hmac_sha256(
        secret.as_bytes(),
        format!("voidreg-contact-form:{payload}").as_bytes(),
    ))
}

pub fn issue(secret: &str, now: i64) -> String {
    let payload = format!("{now}.{}", &random_token()[..16]);
    let signature = sign(secret, &payload);
    format!("{payload}.{signature}")
}

pub fn verify(secret: &str, token: &str, now: i64) -> Result<(), TokenProblem> {
    let mut parts = token.split('.');
    let (Some(issued), Some(nonce), Some(signature), None) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        return Err(TokenProblem::Malformed);
    };
    let issued_at: i64 = issued.parse().map_err(|_| TokenProblem::Malformed)?;
    let expected = sign(secret, &format!("{issued}.{nonce}"));
    if !constant_time_eq(expected.as_bytes(), signature.as_bytes()) {
        return Err(TokenProblem::BadSignature);
    }
    let age = now - issued_at;
    if age < MIN_AGE_SECS {
        return Err(TokenProblem::TooFresh);
    }
    if age > MAX_AGE_SECS {
        return Err(TokenProblem::Expired);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hmac_matches_the_rfc_4231_vectors() {
        let mac = hmac_sha256(&[0x0b; 20], b"Hi There");
        assert_eq!(
            hex::encode(mac),
            "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
        );
        let mac = hmac_sha256(b"Jefe", b"what do ya want for nothing?");
        assert_eq!(
            hex::encode(mac),
            "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
        );
        // A key longer than one block is hashed first (test case 6).
        let mac = hmac_sha256(
            &[0xaa; 131],
            b"Test Using Larger Than Block-Size Key - Hash Key First",
        );
        assert_eq!(
            hex::encode(mac),
            "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54"
        );
    }

    #[test]
    fn tokens_must_age_but_not_too_long() {
        let token = issue("secret", 1_000);
        assert_eq!(verify("secret", &token, 1_001), Err(TokenProblem::TooFresh));
        assert_eq!(verify("secret", &token, 1_000 + MIN_AGE_SECS), Ok(()));
        assert_eq!(verify("secret", &token, 1_000 + MAX_AGE_SECS), Ok(()));
        assert_eq!(
            verify("secret", &token, 1_000 + MAX_AGE_SECS + 1),
            Err(TokenProblem::Expired)
        );
    }

    #[test]
    fn tokens_are_bound_to_the_secret_and_the_payload() {
        let token = issue("secret", 1_000);
        assert_eq!(
            verify("other", &token, 2_000),
            Err(TokenProblem::BadSignature)
        );
        let forged = token.replacen("1000", "1", 1);
        assert_eq!(
            verify("secret", &forged, 2_000),
            Err(TokenProblem::BadSignature)
        );
        for bad in ["", "x", "1.2", "1.2.3.4", "a.b.c"] {
            assert!(verify("secret", bad, 2_000).is_err(), "{bad}");
        }
    }
}
