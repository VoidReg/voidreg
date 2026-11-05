use super::*;
use serde_json::Value;
impl Db {
    pub async fn diagram_is_published(&self, filename: &str) -> Result<bool, AppError> {
        let mut db = self.inner.lock().await;
        let needle = format!("%/media/diagrams/{filename}%");
        let rows = toasty::sql::query("SELECT 1 FROM content_entries WHERE archived=0 AND deleted=0 AND published LIKE ? LIMIT 1")
            .bind(needle).column_types([toasty::stmt::Type::I64]).exec(&mut *db).await?;
        Ok(!rows.is_empty())
    }
    pub async fn media_list(&self) -> Result<Vec<Value>, AppError> {
        let mut db = self.inner.lock().await;
        let assets = models::MediaAsset::all().exec(&mut *db).await?;
        let entries = models::ContentEntry::all().exec(&mut *db).await?;
        assets.into_iter().map(|asset|{
            let mut value:Value=serde_json::from_str(&asset.metadata)?;
            let url=format!("/media/{}",asset.filename);
            let mut used_by=vec![];
            for row in entries.iter().filter(|r|!r.deleted) {
                let mut used=false;
                for raw in [Some(&row.working),row.published.as_ref()].into_iter().flatten(){if referenced(&serde_json::from_str(raw)?,&url,&asset.filename){used=true;}}
                if used{let entry:Value=serde_json::from_str(&row.working)?;used_by.push(serde_json::json!({"kind":row.kind,"slug":entry["slug"],"title":entry["title"]}));}
            }
            value["used_by"]=serde_json::json!(used_by);Ok(value)
        }).collect()
    }
    pub async fn media_save(&self, filename: &str, metadata: &Value) -> Result<(), AppError> {
        let mut db = self.inner.lock().await;
        if models::MediaAsset::filter_by_filename(filename)
            .first()
            .exec(&mut *db)
            .await?
            .is_some()
        {
            toasty::update!(models::MediaAsset::filter_by_filename(filename) {metadata: metadata.to_string()}).exec(&mut *db).await?;
        } else {
            toasty::create!(models::MediaAsset {
                filename: filename.to_owned(),
                metadata: metadata.to_string()
            })
            .exec(&mut *db)
            .await?;
        }
        Ok(())
    }
    pub async fn media_delete(&self, filename: &str) -> Result<(), AppError> {
        let mut db = self.inner.lock().await;
        let url = format!("/media/{filename}");
        let rows = models::ContentEntry::all().exec(&mut *db).await?;
        for row in rows.into_iter().filter(|r| !r.deleted) {
            for raw in [Some(row.working), row.published].into_iter().flatten() {
                if referenced(&serde_json::from_str(&raw)?, &url, filename) {
                    return Err(AppError::Conflict("media is referenced by content".into()));
                }
            }
        }
        models::MediaAsset::filter_by_filename(filename)
            .delete()
            .exec(&mut *db)
            .await?;
        Ok(())
    }
}

fn referenced(v: &Value, url: &str, id: &str) -> bool {
    match v {
        Value::String(s) => s == url || s == id,
        Value::Array(a) => a.iter().any(|v| referenced(v, url, id)),
        Value::Object(o) => o.values().any(|v| referenced(v, url, id)),
        _ => false,
    }
}
