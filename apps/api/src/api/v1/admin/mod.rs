use actix_web::web::ServiceConfig;

pub mod articles;
pub mod comments;
pub mod compilations;
pub mod content;
pub mod mcp;
pub mod media;
pub mod moderation;
pub mod revisions;
pub mod session;
pub mod tags;

pub fn configure(cfg: &mut ServiceConfig) {
    cfg.service(compilations::start)
        .service(compilations::show)
        .service(compilations::refresh)
        .service(compilations::preview)
        .service(compilations::asset)
        .service(moderation::summary)
        .service(moderation::preview)
        .service(moderation::list)
        .service(moderation::block)
        .service(moderation::revoke)
        .service(moderation::moderate)
        .service(mcp::list)
        .service(mcp::create)
        .service(mcp::revoke)
        .service(session::login_options)
        .service(session::login)
        .service(session::show)
        .service(session::logout)
        .service(articles::list_articles)
        .service(articles::create_article)
        .service(articles::get_article)
        .service(articles::update_article)
        .service(articles::publish_article)
        .service(articles::unpublish_article)
        .service(articles::delete_article)
        .service(comments::list_comments)
        .service(comments::approve_comment)
        .service(comments::delete_comment)
        .service(revisions::list)
        .service(revisions::show)
        .service(revisions::restore)
        .service(content::graph)
        .service(tags::list)
        .service(content::list)
        .service(content::get_one)
        .service(content::create)
        .service(content::update)
        .service(content::remove)
        .service(content::action)
        .service(media::list)
        .service(media::upload)
        .service(media::update)
        .service(media::remove);
}
